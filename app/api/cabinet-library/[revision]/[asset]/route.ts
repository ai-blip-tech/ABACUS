import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {cabinetLibraryRoot} from '../../../../../lib/cabinet-library.mjs';

export const runtime='nodejs';

const immutable='public, max-age=31536000, immutable';
const mediaTypes:Record<string,string>={
 json:'application/json',
 glb:'model/gltf-binary',
 jpg:'image/jpeg',
};

export async function GET(_request:Request,{params}:{params:Promise<{revision:string;asset:string}>}){
 const {revision:requestedRevision,asset}=await params;
 const current=requestedRevision==='current' && asset==='manifest.json';
 const root=cabinetLibraryRoot();
 let revision=requestedRevision;
 if(current){
  try{revision=(await readFile(join(root,'current'),'utf8')).trim();}
  catch{return new Response(null,{status:503});}
 }
 if(!/^[a-f0-9]{64}$/.test(revision)||
    !/^(?:manifest\.json|[a-zA-Z0-9_-]{1,80}\.glb|[a-f0-9]{64}\.jpg)$/.test(asset)){
  return new Response(null,{status:404});
 }
 try{
  const bytes=await readFile(join(root,revision,asset));
  const type=mediaTypes[asset.split('.').at(-1)!];
  return new Response(new Uint8Array(bytes),{headers:{
   'Content-Type':type,'Cache-Control':current?'no-store':immutable,'X-Content-Type-Options':'nosniff',
  }});
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')return new Response(null,{status:404});
  return new Response(null,{status:503});
 }
}
