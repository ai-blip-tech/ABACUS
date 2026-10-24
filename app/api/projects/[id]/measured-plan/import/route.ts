import {requireTenantUser,storage,tenantStoragePrefix} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {ensureMeasuredStore} from '@/lib/measured-plan/store';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import sharp from 'sharp';
import {createHash,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
export const runtime='nodejs';
const run=promisify(execFile);let active=0;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Требуется вход'},{status:401});const {id}=await params;
 const project=await database.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first();if(!project)return Response.json({error:'Проект не найден'},{status:404});
 if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник запроса'},{status:403});if(active>=2)return Response.json({error:'Другой файл ещё обрабатывается. Повторите позже.'},{status:429});
 active++;let temp:string|undefined;
 try{
  const reader=request.body?.getReader();if(!reader)throw Error('Файл пуст');const chunks:Uint8Array[]=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>20*1024*1024){await reader.cancel();throw Error('Максимальный размер файла — 20 МБ');}chunks.push(value);}const bytes=Buffer.concat(chunks);
  const pdf=bytes.subarray(0,5).toString()==='%PDF-',png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if(!pdf&&!png&&!jpeg)throw Error('Нужен JPEG, PNG или PDF');
  const mime=pdf?'application/pdf':png?'image/png':'image/jpeg',page=Number(new URL(request.url).searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>500)throw Error('Неверная страница PDF');let pages=1,preview:Buffer;
  if(pdf){temp=await mkdtemp(join(tmpdir(),'rd-measure-'));const input=join(temp,'input.pdf');await writeFile(input,bytes);try{const info=await run(process.env.PDFINFO_BIN||'pdfinfo',[input],{timeout:15000,maxBuffer:256000});pages=Number(info.stdout.match(/Pages:\s+(\d+)/)?.[1]);if(!pages||pages>500||page>pages)throw Error('Неверный номер страницы или более 500 страниц');await run(process.env.PDFTOPPM_BIN||'pdftoppm',['-f',String(page),'-l',String(page),'-singlefile','-scale-to','2200','-png',input,join(temp,'preview')],{timeout:25000,maxBuffer:256000});preview=await readFile(join(temp,'preview.png'));}catch(e){throw Error((e as NodeJS.ErrnoException).code==='ENOENT'?'На сервере не установлен обработчик PDF (Poppler). Можно загрузить PNG/JPEG.':e instanceof Error?e.message:'Не удалось прочитать PDF');}}
  else{const image=sharp(bytes,{limitInputPixels:16000*16000,failOn:'error'}),metadata=await image.metadata();if(!metadata.width||!metadata.height||metadata.width>16000||metadata.height>16000)throw Error('Слишком большое или повреждённое изображение');preview=await image.rotate().resize({width:2200,height:2200,fit:'inside',withoutEnlargement:true}).png().toBuffer();}
  const metadata=await sharp(preview).metadata(),hash=createHash('sha256').update(bytes).digest('hex'),asset='measure-'+randomUUID(),originalAsset=asset+'-source';
  await storage().put(`${tenantStoragePrefix(user)}/projects/${id}/${asset}`,preview,{httpMetadata:{contentType:'image/png'}});await storage().put(`${tenantStoragePrefix(user)}/projects/${id}/${originalAsset}`,bytes,{httpMetadata:{contentType:mime}});
  ensureMeasuredStore();await database.prepare('INSERT INTO measured_plan_assets(project_id,asset) VALUES(?,?),(?,?)').bind(id,asset,id,originalAsset).run();
  let prepared=false;try{const fixture=await readFile(join(process.cwd(),'public','measured-plan-reference.png'));prepared=createHash('sha256').update(fixture).digest('hex')===hash;}catch{/* No curated fixture in this deployment. */}
  return Response.json({hash,prepared,width:metadata.width,height:metadata.height,page,pages,image:`/api/projects/${encodeURIComponent(id)}/assets/${asset}`,originalAsset,words:[],ocrWarning:prepared?'Геометрия примера подготовлена вручную. Проверьте реальные размеры.':'Автоматическое чтение подписей пока не подключено. Проверьте выделенные стены и укажите размеры вручную.'},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось обработать файл'},{status:400});}finally{if(temp)await rm(temp,{recursive:true,force:true});active--;}
}
