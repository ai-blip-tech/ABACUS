import {sameWallGeometry,syncOpenings} from '@/lib/planning-plan/opening-sync';
import {requireTenantUser,storage,tenantStoragePrefix} from '@/lib/auth';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {findSurfaceProduct} from '@/lib/surface-catalog';
import {preparedCatalogTile} from '@/lib/tile-texture-cache';
import {database} from '@/lib/server-runtime';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import {validateMeasuredDocument,ensureMeasuredStore} from '@/lib/measured-plan/store';
import {validateFurniture} from '@/lib/planning-plan/furniture';
import {mergeFloorCoverings} from '@/lib/floor-2/planning-sync';
import {readAlbum} from '@/lib/planning-plan/variants';
import {validateExtraRegions,sourceFingerprint,upgradeFloorLayers,type Floor2Document,type Floor2Region} from '@/lib/floor-2/model';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
function ensure(){database.prepare('CREATE TABLE IF NOT EXISTS planning_floor_previews(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,revision INTEGER NOT NULL,document_json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(project_id,user_id,tenant_id))').execute();}

export async function GET(request:Request,{params}:Context){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Войдите в Room Design'},{status:401});const{id}=await params;
 const project=await database.prepare('SELECT id,name FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first();if(!project)return Response.json({error:'Проект не найден'},{status:404});ensure();
 const source=await database.prepare('SELECT document_json FROM planning_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{document_json:string}>();
 if(!source)return Response.json({error:'Сначала создайте планировочное решение проекта'},{status:409});
 const album=readAlbum(JSON.parse(source.document_json)),sourcePlan=album.variants.manual?.plan||album.baseline;
 const row=await database.prepare('SELECT revision,document_json FROM planning_floor_previews WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{revision:number;document_json:string}>();
 const document:Floor2Document=row?JSON.parse(row.document_json):{version:1,plan:structuredClone(sourcePlan),sourceFingerprint:sourceFingerprint(sourcePlan)};
 const synced=sameWallGeometry(document.plan,sourcePlan)?{...document,plan:syncOpenings(document.plan,sourcePlan),sourceFingerprint:sourceFingerprint(sourcePlan)}:document;
 return Response.json({project,document:upgradeFloorLayers(synced),sourcePlan,revision:row?.revision||0},{headers:{'Cache-Control':'private, no-store'}});
}
export async function PUT(request:Request,{params}:Context){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Войдите в Room Design'},{status:401});if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник'},{status:403});const{id}=await params;
 if(!await database.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first())return Response.json({error:'Проект не найден'},{status:404});
 try{const text=await request.text();if(text.length>6000000)throw Error('План слишком большой');const body=JSON.parse(text);if(!Number.isSafeInteger(body.revision)||body.revision<0||body.document?.version!==1||typeof body.document.sourceFingerprint!=='string')throw Error('Некорректная версия');
 const plan=validateMeasuredDocument(body.document.plan,id,{allowManualSource:true});plan.furniture=validateFurniture(plan.furniture||[]);validateExtraRegions((plan.floorRegions||[]) as Floor2Region[]);
 const textureWarnings:string[]=[];ensureMeasuredStore();
 for(const region of (plan.floorRegions||[]) as Floor2Region[])for(const r of [region,...Object.values(region.tileCells||{}).filter(cell=>cell.product).map(cell=>({id:region.id,material:'tile',tile:cell.product!.tile,product:cell.product!}))]){if(r.material!=='tile'||!r.tile||r.tile.image.startsWith('/api/projects/'+id+'/assets/'))continue;try{const product=await findSurfaceProduct(r.tile.id)|| (r.product?.sourceImage?{...r.tile,image:r.product.sourceImage,widthMm:r.tile.widthMm,depthMm:r.tile.heightMm}:null);if(!product)throw Error('Товар отсутствует в каталоге');const prepared=await preparedCatalogTile(product);if(prepared.report.status!=='ready')throw Error('Текстура не подтверждена');const bytes=await readFile(prepared.imagePath),asset='floor2-texture-'+createHash('sha256').update(bytes).digest('hex').slice(0,24),key=tenantStoragePrefix(user)+'/projects/'+id+'/'+asset;if(!await storage().get(key))await storage().put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});database.prepare('INSERT OR IGNORE INTO measured_plan_assets(project_id,asset) VALUES(?,?)').bind(id,asset).execute();r.tile.image='/api/projects/'+id+'/assets/'+asset;if(r.product){r.product.image=r.tile.image;if(r.product.tile)r.product.tile.image=r.tile.image;}}catch{textureWarnings.push(r.id);}}
 const document:Floor2Document={version:1,layeringVersion:1,plan,sourceFingerprint:body.document.sourceFingerprint};ensure();
 const revision=database.transaction(db=>{const old=db.prepare('SELECT revision FROM planning_floor_previews WHERE project_id=? AND user_id=? AND tenant_id=?').get(id,user.id,user.tenantId) as {revision:number}|undefined;if((old?.revision||0)!==body.revision)return null;const latest=db.prepare('SELECT revision,document_json FROM planning_plans WHERE project_id=? AND user_id=? AND tenant_id=?').get(id,user.id,user.tenantId) as {revision:number;document_json:string}|undefined;if(!latest)throw Error('Планировочное решение не найдено');const merged=mergeFloorCoverings(readAlbum(JSON.parse(latest.document_json)),plan),planningRevision=latest.revision+1;db.prepare('UPDATE planning_plans SET revision=?,document_json=?,updated_at=? WHERE project_id=? AND user_id=? AND tenant_id=?').run(planningRevision,JSON.stringify(merged),new Date().toISOString(),id,user.id,user.tenantId);db.prepare('UPDATE projects SET updated_at=? WHERE id=? AND user_id=? AND tenant_id=?').run(new Date().toISOString(),id,user.id,user.tenantId);const next=body.revision+1;db.prepare('INSERT INTO planning_floor_previews(project_id,user_id,tenant_id,revision,document_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,user_id,tenant_id) DO UPDATE SET revision=excluded.revision,document_json=excluded.document_json,updated_at=excluded.updated_at').run(id,user.id,user.tenantId,next,JSON.stringify(document),new Date().toISOString());return {floorRevision:next,planningRevision};});
 if(revision===null)return Response.json({error:'«Напольное покрытие» изменён в другой вкладке. Обновите страницу; текущий выбор сохраните перед выходом.'},{status:409});return Response.json({revision:revision.floorRevision,planningRevision:revision.planningRevision,document,textureWarnings},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось сохранить «Напольное покрытие»'},{status:400});}
}
