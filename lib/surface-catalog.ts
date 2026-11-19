import {filterTileCatalogImages} from './tile-catalog-quality.ts';
import {parseFurnitureCatalog,type FurnitureCatalogProduct} from './furniture-catalog.ts';
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
const snapshotPath=()=>path.join(process.env.ROOM_DESIGN_DATA_DIR||path.join(process.cwd(),'data'),'surface-catalog-approved-v2.json');
type Snapshot={until:number;products:FurnitureCatalogProduct[]};
let cached:Snapshot|null=null,pending:Promise<FurnitureCatalogProduct[]>|null=null,retryAfter=0;
async function refresh(){
 const r=await fetch('https://norrmobler.ru/yml.php',{cache:'no-store',signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error('Фид покрытий недоступен');
 const {products}=await filterTileCatalogImages(parseFurnitureCatalog(await r.text(),'norrmobler',{surfaceOnly:true}));
 if(!products.length)throw Error('Фид не вернул подтверждённых покрытий');
 cached={until:Date.now()+1800000,products};
 try{const file=snapshotPath(),temp=file+'.'+randomUUID()+'.tmp';await mkdir(path.dirname(file),{recursive:true});await writeFile(temp,JSON.stringify(cached));await rename(temp,file);}catch{}
 return products;
}
function startRefresh(){if(!pending)pending=refresh().finally(()=>{pending=null;});return pending;}
export function surfaceCatalogNotice(){return cached&&cached.until<=Date.now()?'Показываем сохранённый каталог. Обновление поставщика пока недоступно; цены и наличие могут измениться.':'';}
export async function loadSurfaceCatalog(){
 if(!cached){try{const saved=JSON.parse(await readFile(snapshotPath(),'utf8').catch(error=>process.env.ROOM_DESIGN_PARQUET_DIR?readFile(path.join(process.env.ROOM_DESIGN_PARQUET_DIR,'surface-catalog-approved-v2.json'),'utf8'):Promise.reject(error)));if(Number.isFinite(saved.until)&&Array.isArray(saved.products)&&saved.products.length)cached=saved;}catch{}}
 if(cached){
  if(cached.until<=Date.now()&&Date.now()>=retryAfter&&!pending){retryAfter=Date.now()+60000;void startRefresh().catch(()=>{});}
  return cached.products;
 }
 // An empty, valid feed is distinct from a failed request, for the shared catalog.
 try{return await startRefresh();}catch(error){if((error as Error).message==='Фид не вернул подтверждённых покрытий')return[];throw error;}
}
/** Already approved textures must remain accessible while the supplier feed is down. */
export async function findSurfaceProduct(id:string){return(await loadSurfaceCatalog()).find(p=>p.id===id||'norrmobler:'+p.id===id);}
