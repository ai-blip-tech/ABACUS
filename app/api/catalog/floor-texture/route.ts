import {loadSurfaceCatalog} from '@/lib/surface-catalog';
import {preparedCatalogTile} from '@/lib/tile-texture-cache';
import {readFile} from 'node:fs/promises';
export const runtime='nodejs';
export async function GET(request:Request){
 const search=new URL(request.url).searchParams,id=search.get('id'),inspect=search.get('inspect')==='1';let response:Response;
 if(!id||id.length>220)return Response.json({error:'Укажите товар'},{status:400});
 try{const products=await loadSurfaceCatalog(),product=products.find(p=>p.id===id||'norrmobler:'+p.id===id);if(!product){response=inspect?Response.json({status:'unsuitable',reason:'Фото товара не прошло проверку для раскладки. Товар исключён из каталога покрытий.'}):new Response('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#d2cec7" d="M0 0h256v256H0z"/></svg>',{headers:{'Content-Type':'image/svg+xml'}});}else{const {report,imagePath}=await preparedCatalogTile(product);response=inspect?Response.json(report):report.status==='ready'?new Response(await readFile(imagePath),{headers:{'Content-Type':'image/jpeg'}}):new Response(null,{status:422});}}
 catch{response=inspect?Response.json({status:'unavailable',reason:'Не удалось проверить изображение. Оно не используется как текстура.'},{status:503}):new Response(null,{status:503});}
 const headers=new Headers(response.headers),origin=request.headers.get('origin');if(origin==='http://localhost:4198'||origin==='http://127.0.0.1:4198')headers.set('Access-Control-Allow-Origin',origin);headers.set('Vary','Origin');headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers});
}
