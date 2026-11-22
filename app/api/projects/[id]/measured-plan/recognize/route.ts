import {requireTenantUser,ensureStore,storage,tenantStoragePrefix} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {openAIKey} from '@/lib/server-config';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import {buildAIPlan} from '@/lib/measured-plan/measure-ai';
import type {MeasureDoc} from '@/lib/measured-plan/measure-model';
import {recognitionProfile,recognitionRequest,recognitionSnapshotSettings,isCurrentRecognitionSnapshot} from '@/lib/measured-plan/recognition-settings';
export const runtime='nodejs';
const samePlan=(a:MeasureDoc,b:MeasureDoc)=>JSON.stringify({...a,updatedAt:''})===JSON.stringify({...b,updatedAt:''});
const enabled=()=>process.env.ROOM_DESIGN_MEASURE_AI_ENABLED==='1';
async function readProviderResponse(id:string,key:string){
 for(let attempt=0;attempt<2;attempt++){
  try{const response=await fetch('https://api.openai.com/v1/responses/'+encodeURIComponent(id),{headers:{Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(8000),cache:'no-store'});return{response,result:await response.json()};}
  catch(error){if(attempt===1)throw error;await new Promise(resolve=>setTimeout(resolve,300));}
 }
 throw Error('Не удалось проверить состояние анализа');
}
type Context={params:Promise<{id:string}>};
async function context(request:Request,id:string){const user=await requireTenantUser(request);if(!user)return null;const row=await database.prepare('SELECT document_json,revision FROM measured_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{document_json:string;revision:number}>();return row?{user,doc:JSON.parse(row.document_json) as MeasureDoc,revision:row.revision}:null;}
export async function POST(request:Request,{params}:Context){
 if(!enabled())return Response.json({error:'Анализ файла выключен.'},{status:404});
 if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник запроса'},{status:403});
 const {id}=await params,c=await context(request,id);if(!c)return Response.json({error:'План не найден'},{status:404});
 const key=openAIKey();if(!key)return Response.json({error:'API распознавания не подключён.'},{status:503});
 const body=await request.json().catch(()=>null);if(body?.revision!==c.revision)return Response.json({error:'Сначала сохраните текущий план и повторите распознавание.'},{status:409});
 const prefix='/api/projects/'+encodeURIComponent(id)+'/assets/',asset=c.doc.source.image.startsWith(prefix)?c.doc.source.image.slice(prefix.length):'';
 if(!/^measure-[a-zA-Z0-9-]+$/.test(asset))return Response.json({error:'Нужен сохранённый исходный чертёж.'},{status:400});
 await ensureStore();const kind=`measure:${id}:${c.revision}`;
 const active=await database.prepare('SELECT id,created_at FROM ai_jobs WHERE tenant_id=? AND user_id=? AND kind LIKE ? AND created_at>? ORDER BY created_at DESC LIMIT 1').bind(c.user.tenantId,c.user.id,`measure:${id}:%`,new Date(Date.now()-24*60*60*1000).toISOString()).first<{id:string;created_at:string}>();if(active){const saved=await storage().get(`${tenantStoragePrefix(c.user)}/projects/${id}/measure-ai/${active.id}.json`);if(saved){const snapshot=await new Response(saved.body).json();if(!snapshot.failed&&isCurrentRecognitionSnapshot(snapshot)&&samePlan(snapshot.document,c.doc))return Response.json({id:active.id,status:'in_progress',startedAt:active.created_at,profile:recognitionProfile},{status:202});}}
 let stage='чтение исходника';
 try{
  stage='чтение исходника';
  const object=await storage().get(`${tenantStoragePrefix(c.user)}/projects/${id}/${asset}`);if(!object)return Response.json({error:'Исходное изображение не найдено.'},{status:404});
  const bytes=await new Response(object.body).arrayBuffer();if(bytes.byteLength>12000000)return Response.json({error:'Исходник слишком большой для распознавания.'},{status:413});
  const image='data:image/png;base64,'+Buffer.from(bytes).toString('base64');
  stage='отправка в AI';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(60000),body:JSON.stringify(recognitionRequest(image))});
  stage='ответ AI';
  const result=await response.json();if(!response.ok||!result.id)return Response.json({error:'Не удалось запустить анализ файла. Повторите попытку позже.'},{status:502});
  await storage().put(`${tenantStoragePrefix(c.user)}/projects/${id}/measure-ai/${result.id}.json`,new TextEncoder().encode(JSON.stringify({revision:c.revision,document:c.doc,...recognitionSnapshotSettings()})));
  await database.prepare('INSERT INTO ai_jobs(id,tenant_id,user_id,kind,created_at) VALUES(?,?,?,?,?)').bind(result.id,c.user.tenantId,c.user.id,kind,new Date().toISOString()).run();return Response.json({id:result.id,status:result.status,startedAt:new Date().toISOString(),profile:recognitionProfile},{status:202});
 }catch(e){const code=(e as {cause?:{code?:string}})?.cause?.code;return Response.json({error:`Ошибка на этапе «${stage}»${code?' ('+code+')':''}. Исходный план сохранён.`},{status:502});}
}
export async function GET(request:Request,{params}:Context){
 if(!enabled())return Response.json({enabled:false},{headers:{'Cache-Control':'no-store'}});
 const {id}=await params,c=await context(request,id);if(!c)return Response.json({error:'План не найден'},{status:404});
 const job=new URL(request.url).searchParams.get('job');if(!job){
  const latest=await database.prepare('SELECT id,created_at FROM ai_jobs WHERE tenant_id=? AND user_id=? AND kind LIKE ? AND created_at>? ORDER BY created_at DESC LIMIT 1').bind(c.user.tenantId,c.user.id,`measure:${id}:%`,new Date(Date.now()-24*60*60*1000).toISOString()).first<{id:string;created_at:string}>();
  let pendingJob:null|{id:string;hash:string;startedAt:string;profile:string}=null;
  if(latest){const stored=await storage().get(`${tenantStoragePrefix(c.user)}/projects/${id}/measure-ai/${latest.id}.json`);if(stored){const snapshot=await new Response(stored.body).json();if(!snapshot.failed&&isCurrentRecognitionSnapshot(snapshot)&&samePlan(snapshot.document,c.doc))pendingJob={id:latest.id,hash:c.doc.source.hash,startedAt:latest.created_at,profile:recognitionProfile};}}
  return Response.json({enabled:true,profile:recognitionProfile,pendingJob},{headers:{'Cache-Control':'no-store'}});
 }
 const owned=await database.prepare('SELECT kind FROM ai_jobs WHERE id=? AND tenant_id=? AND user_id=?').bind(job,c.user.tenantId,c.user.id).first<{kind:string}>();if(!owned||!owned.kind.startsWith(`measure:${id}:`))return Response.json({error:'Задача не найдена'},{status:404});
 const profileSnapshot=await storage().get(`${tenantStoragePrefix(c.user)}/projects/${id}/measure-ai/${job}.json`);if(!profileSnapshot||!isCurrentRecognitionSnapshot(await new Response(profileSnapshot.body).json()))return Response.json({error:'Настройки анализа обновились. Нажмите «Проанализировать файл», чтобы запустить новый анализ.',terminal:true},{status:409});
 if(owned.kind!==`measure:${id}:${c.revision}`){const saved=await storage().get(`${tenantStoragePrefix(c.user)}/projects/${id}/measure-ai/${job}.json`);const snapshot=saved?await new Response(saved.body).json():null;if(!snapshot||!samePlan(snapshot.document,c.doc))return Response.json({error:'План изменён во время распознавания. Результат не применён.'},{status:409});}
 const key=openAIKey();if(!key)return Response.json({error:'API не подключён'},{status:503});
 try{const {response,result}=await readProviderResponse(job,key);if(!response.ok)return Response.json({error:'Не удалось получить состояние анализа. Повторите попытку позже.'},{status:502});
  const fail=async()=>{const path=`${tenantStoragePrefix(c.user)}/projects/${id}/measure-ai/${job}.json`;const saved=await storage().get(path);if(saved){const snapshot=await new Response(saved.body).json();await storage().put(path,new TextEncoder().encode(JSON.stringify({...snapshot,failed:true})));}};
  if(['failed','cancelled','incomplete'].includes(result.status)){await fail();return Response.json({error:'Не удалось завершить анализ файла. Исходный план сохранён. Можно повторить анализ.',terminal:true},{status:502});}
  if(result.status!=='completed')return Response.json({status:result.status},{headers:{'Cache-Control':'no-store'}});
  const raw=result.output_text||result.output?.flatMap((o:any)=>o.content||[]).filter((o:any)=>o.type==='output_text').map((o:any)=>o.text).join('');if(!raw)throw Error('AI не вернул разметку чертежа');
  try{const recognition=JSON.parse(raw),built=buildAIPlan(c.doc,recognition);built.document.source.analysisResult={jobId:job,completedAt:new Date((result.completed_at||Date.now()/1000)*1000).toISOString()};return Response.json({status:'completed',...built},{headers:{'Cache-Control':'no-store'}});}catch{await fail();return Response.json({error:'Не удалось построить корректный план по результату анализа. Исходник сохранён. Можно повторить анализ.',terminal:true},{status:502});}
 }catch(e){return Response.json({error:'Результат пока не получен. Текущий план сохранён. Повторите проверку позже.'},{status:502});}
}
