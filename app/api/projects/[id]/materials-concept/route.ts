import {createHash} from 'node:crypto';

import {ensureStore,requireTenantUser,storage,tenantStoragePrefix,type AppUser} from '@/lib/auth';
import {isBoard,type MaterialBoard,type MaterialNode} from '@/lib/material-board/model';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import {database} from '@/lib/server-runtime';

export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
type StoredRow={document_json:string;revision:number};
type PreparedBoard={board:MaterialBoard;assets:Map<string,{bytes:Uint8Array;contentType:string}>};
const assetPattern=(projectId:string)=>new RegExp('^/api/projects/'+projectId+'/assets/([a-zA-Z0-9-]{1,100})$');

function ensureMaterialsStore(){
 database.prepare('CREATE TABLE IF NOT EXISTS material_boards(project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,revision INTEGER NOT NULL,document_json TEXT NOT NULL,updated_at TEXT NOT NULL)').execute();
 database.prepare('CREATE TABLE IF NOT EXISTS material_board_assets(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,asset TEXT NOT NULL,PRIMARY KEY(project_id,asset))').execute();
}

function decodeImage(value:string){
 const match=/^data:image\/(png|jpeg|webp);base64,([a-zA-Z0-9+/=]+)$/.exec(value);
 if(!match)return null;
 const bytes=Uint8Array.from(Buffer.from(match[2],'base64'));
 if(!bytes.length||bytes.length>12_000_000)throw Error('Одно из изображений превышает 12 МБ');
 return{bytes,contentType:'image/'+match[1]};
}

function prepareBoard(value:unknown,projectId:string):PreparedBoard{
 if(!isBoard(value))throw Error('Повреждена структура раздела «Концепция и материалы»');
 const assets=new Map<string,{bytes:Uint8Array;contentType:string}>(),pattern=assetPattern(projectId);
 const prepareImage=(image:string|undefined)=>{
  if(!image)return image;
  const decoded=decodeImage(image);
  if(decoded){
   const hash=createHash('sha256').update(decoded.bytes).digest('hex'),asset='material-'+hash.slice(0,48);
   assets.set(asset,decoded);
   return '/api/projects/'+encodeURIComponent(projectId)+'/assets/'+asset;
  }
  if(image.startsWith('/api/projects/')){
   const match=pattern.exec(image);
   if(!match)throw Error('Изображение принадлежит другому проекту');
  }
  return image;
 };
 const nodes=value.nodes.map((node:MaterialNode)=>({...node,image:prepareImage(node.image),originalImage:prepareImage(node.originalImage)}));
 const board={...value,nodes};
 if(!isBoard(board))throw Error('Не удалось подготовить раздел к сохранению');
 return{board,assets};
}

const storageKey=(user:AppUser,projectId:string,asset:string)=>tenantStoragePrefix(user)+'/projects/'+projectId+'/'+asset;
const boardAssets=(board:MaterialBoard,projectId:string)=>{
 const pattern=assetPattern(projectId),assets=new Set<string>();
 for(const node of board.nodes)for(const image of [node.image,node.originalImage]){const match=image&&pattern.exec(image);if(match)assets.add(match[1]);}
 return assets;
};

export async function GET(request:Request,{params}:Context){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Требуется вход'},{status:401});
 await ensureStore();const{id}=await params;
 const project=await database.prepare('SELECT id,name FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first();
 if(!project)return Response.json({error:'Проект не найден'},{status:404});
 ensureMaterialsStore();
 const saved=await database.prepare('SELECT document_json,revision FROM material_boards WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<StoredRow>();
 let document:MaterialBoard|null=null;
 if(saved){try{const parsed=JSON.parse(saved.document_json);if(!isBoard(parsed))throw Error();document=parsed;}catch{return Response.json({error:'Не удалось прочитать сохранённый раздел'},{status:500});}}
 return Response.json({project,document,revision:saved?.revision||0},{headers:{'Cache-Control':'private, no-store'}});
}

export async function PUT(request:Request,{params}:Context){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Требуется вход'},{status:401});
 if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник запроса'},{status:403});
 await ensureStore();const{id}=await params;
 const project=await database.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first();
 if(!project)return Response.json({error:'Проект не найден'},{status:404});
 try{
  const raw=await request.text();if(raw.length>35_000_000)return Response.json({error:'Проект слишком большой для сохранения'},{status:413});
  const body=JSON.parse(raw);if(!Number.isInteger(body.revision)||body.revision<0)throw Error('Не указана версия проекта');
  const prepared=prepareBoard(body.document,id);
  await Promise.all([...prepared.assets].map(([asset,file])=>storage().put(storageKey(user,id,asset),file.bytes,{httpMetadata:{contentType:file.contentType},customMetadata:{projectId:id,userId:user.id,tenantId:user.tenantId}})));
  ensureMaterialsStore();const referenced=boardAssets(prepared.board,id),now=new Date().toISOString();
  const result=database.transaction(db=>{
   const old=db.prepare('SELECT revision FROM material_boards WHERE project_id=? AND user_id=? AND tenant_id=?').get(id,user.id,user.tenantId) as {revision:number}|undefined;
   if((old?.revision||0)!==body.revision)return null;
   const previous=(db.prepare('SELECT asset FROM material_board_assets WHERE project_id=?').all(id) as {asset:string}[]).map(row=>row.asset);
   const revision=body.revision+1;
   db.prepare('INSERT INTO material_boards(project_id,user_id,tenant_id,revision,document_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,document_json=excluded.document_json,updated_at=excluded.updated_at').run(id,user.id,user.tenantId,revision,JSON.stringify(prepared.board),now);
   db.prepare('DELETE FROM material_board_assets WHERE project_id=?').run(id);
   const insert=db.prepare('INSERT INTO material_board_assets(project_id,asset) VALUES(?,?)');
   for(const asset of referenced)insert.run(id,asset);
   db.prepare('UPDATE projects SET updated_at=? WHERE id=? AND user_id=? AND tenant_id=?').run(now,id,user.id,user.tenantId);
   return{revision,stale:previous.filter(asset=>!referenced.has(asset))};
  });
  if(!result)return Response.json({error:'Проект изменён в другой вкладке. Обновите страницу; сохранение остановлено.'},{status:409});
  await Promise.allSettled(result.stale.map(asset=>storage().delete(storageKey(user,id,asset))));
  return Response.json({document:prepared.board,revision:result.revision},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Не удалось сохранить раздел'},{status:400});}
}
