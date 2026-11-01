import { requireTenantUser } from '@/lib/auth';
import { prepareModelReference } from '@/lib/model3d-reference';
import { readFileSync } from 'node:fs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};

async function limitedBody(request:Request,limit:number){
  const reader=request.body?.getReader();const chunks:Uint8Array[]=[];let size=0;
  if(reader)try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('Запрос слишком большой.');}chunks.push(value);}}finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
async function relay(request:Request,context:Context){
  const {path=[]}=await context.params;
  let secret=process.env.MODEL3D_SERVICE_SECRET || '';
  if(!secret)try{secret=readFileSync(process.env.MODEL3D_SERVICE_SECRET_FILE||'/home/codex/.config/roomdesign-model3d-service-key','utf8').trim();}catch{/* Service is not installed on this host yet. */}
  if(secret.length<32)return Response.json({error:'Сервис 3D ещё не настроен.'},{status:503});
  const base=process.env.MODEL3D_INTERNAL_URL || 'http://127.0.0.1:4199';
  const worker=path.length===3&&path[0]==='worker'&&/^[a-f0-9-]{36}$/.test(path[1])&&['input','result','heartbeat','failed'].includes(path[2]);
  let target:string,headers:Record<string,string>,body:Buffer|undefined;
  if(worker){
    const methods:Record<string,string>={input:'GET',result:'PUT',heartbeat:'POST',failed:'POST'};
    if(request.method!==methods[path[2]])return new Response(null,{status:405});
    const token=request.headers.get('Authorization')||'';
    if(!/^Bearer [a-f0-9]{64}$/.test(token))return Response.json({error:'Доступ запрещён.'},{status:401});
    target=`/worker/jobs/${path[1]}/${path[2]}`;
    headers={Authorization:token,'Content-Type':request.headers.get('Content-Type')||'application/json'};
    if(request.method!=='GET')body=await limitedBody(request,path[2]==='result'?50*1024*1024:2048);
  }else{
    const user=await requireTenantUser(request);
    if(!user)return Response.json({error:'Требуется вход.'},{status:401});
    headers={'X-Model-Service-Secret':secret,'X-Model-User':user.id,'X-Model-Tenant':user.tenantId,'X-Model-Admin':user.role==='admin'?'1':'0'};
    const resource=path.join('/');
    if(request.method==='GET'&&(/^(?:catalog|jobs\/[a-f0-9-]{36}|assets(?:\/[a-f0-9-]{36}(?:\/file)?)?)$/.test(resource)))target='/internal/'+resource;
    else if(request.method==='GET'&&resource==='health')target='/internal/health';
    else if(request.method==='POST'&&resource==='jobs'){
      // Billing/design for the separate paid tab is deliberately not invented here.
      if(user.role!=='admin')return Response.json({error:'Публичная платная генерация ещё не подключена.'},{status:403});
      const origin=request.headers.get('Origin');
      const allowed=[new URL(request.url).origin,...(process.env.NODE_ENV!=='production'?(process.env.MODEL3D_DEV_ORIGINS||'').split(','):[])];
      if(origin&&!allowed.includes(origin))return Response.json({error:'Некорректный источник запроса.'},{status:403});
      const key=request.headers.get('Idempotency-Key')||'';
      if(!/^[\w-]{8,128}$/.test(key))return Response.json({error:'Нужен Idempotency-Key.'},{status:400});
      let input;
      try{input=JSON.parse((await limitedBody(request,14*1024*1024)).toString('utf8'));body=Buffer.from(JSON.stringify(await prepareModelReference(input)));}
      catch{return Response.json({error:'Не удалось подготовить референс. Проверьте фото, размеры и доступность товара.'},{status:400});}
      headers['Idempotency-Key']=key;headers['Content-Type']='application/json';target='/internal/jobs';
    }else return Response.json({error:'Не найдено.'},{status:404});
  }
  try{
    const response=await fetch(new URL(target,base),{method:request.method,headers,...(body?{body:new Uint8Array(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(90000)});
    const outputHeaders=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
    for(const name of ['Content-Type','Content-Length','Content-Disposition','ETag']){const value=response.headers.get(name);if(value)outputHeaders.set(name,value);}
    return new Response(response.body,{status:response.status,headers:outputHeaders});
  }catch{return Response.json({error:'Сервис 3D временно недоступен. Задание можно проверить позже; не создавайте дубликат.'},{status:503});}
}
export async function GET(request:Request,context:Context){return relay(request,context);}
export async function POST(request:Request,context:Context){return relay(request,context);}
export async function PUT(request:Request,context:Context){return relay(request,context);}
