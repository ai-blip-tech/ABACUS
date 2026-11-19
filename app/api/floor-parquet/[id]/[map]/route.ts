import {readFile} from 'node:fs/promises';

import {join} from 'node:path';
import {requireTenantUser} from '@/lib/auth';
import {ambientParquetFiles} from '@/lib/floor-2/ambient-parquet';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string;map:string}>}){
 if(!await requireTenantUser(request))return new Response('Требуется вход',{status:401});
 const{id,map}=await params,material=ambientParquetFiles.find(m=>m.id===id),filename=material?.maps[map as keyof typeof material.maps];
 if(!filename)return new Response(null,{status:404});
 try{const root=process.env.ROOM_DESIGN_PARQUET_DIR||join(process.env.ROOM_DESIGN_DATA_DIR||join(process.cwd(),'data'),'ambient-parquet');const original=()=>readFile(join(root,'PBR',id,filename));const bytes=map==='Color'&&new URL(request.url).searchParams.get('original')!=='1'?await readFile(join(root,'preview',id+'.jpg')).catch(original):await original();return new Response(bytes,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff'}});}catch{return new Response('Файл текстуры отсутствует в хранилище',{status:404});}
}
