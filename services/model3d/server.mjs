import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ModelStore } from './store.mjs';
import { configFromEnv } from './config.mjs';
import { Runpod } from './runpod.mjs';
import { Coordinator } from './coordinator.mjs';
import { HttpError, principal, equalSecret, sha256, publicJob } from './contracts.mjs';

async function body(request, limit) {
  const chunks=[]; let size=0;
  if (Number(request.headers['content-length']) > limit) throw new HttpError(413,'Файл слишком большой.');
  for await (const chunk of request) { size+=chunk.length; if(size>limit) throw new HttpError(413,'Файл слишком большой.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(request) { try { return JSON.parse((await body(request,14*1024*1024)).toString('utf8')); } catch(e) { if(e instanceof HttpError)throw e; throw new HttpError(400,'Некорректный JSON.'); } }
function send(response,status,value) { response.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(JSON.stringify(value)); }

export function createModelServer(config, store, provider) {
  const coordinator = new Coordinator(store,provider,config);
  const server=createServer(async(request,response)=>{
    try {
      const path=new URL(request.url,'http://localhost').pathname;
      const worker=path.match(/^\/worker\/jobs\/([a-f0-9-]{36})\/(input|result|heartbeat|failed)$/);
      if(worker) {
        let job=store.job(worker[1]);
        const supplied=request.headers.authorization?.replace(/^Bearer /,'');
        if(!job?.token_hash || !supplied || !equalSecret(sha256(supplied),job.token_hash))throw new HttpError(401,'Недействительный токен задания.');
        const action=worker[2];
        if(action==='result'&&request.method==='PUT') {
          const result=store.complete(job,await body(request,50*1024*1024));
          send(response,200,result);
          void coordinator.tick().catch(()=>console.error('[model3d] cleanup will retry'));
          return;
        }
        if(!['provisioning','running'].includes(job.state)||job.deadline_at<=Date.now())throw new HttpError(409,'Задание больше не активно.');
        if(action==='input'&&request.method==='GET') {
          const asset=store.db.prepare('SELECT * FROM assets WHERE id=?').get(job.asset_id);
          return send(response,200,{id:job.id,assetId:job.asset_id,imageBase64:readFileSync(store.file(job.asset_id,'reference.png')).toString('base64'),settings:JSON.parse(asset.settings_json),deadlineMs:job.deadline_at,engineRevision:config.engineRevision});
        }
        if(action==='heartbeat'&&request.method==='POST') {
          const payload=await jsonBody(request);
          const stage=['loading','generating','exporting','uploading'].includes(payload.stage)?payload.stage:'generating';
          const messages={loading:'Загружаем модель на GPU.',generating:'Создаём 3D-модель.',exporting:'Подготавливаем GLB.',uploading:'Сохраняем модель.'};
          store.db.prepare("UPDATE jobs SET state='running',progress=?,message=?,last_heartbeat=?,updated_at=? WHERE id=? AND state IN ('provisioning','running')").run(stage,messages[stage],Date.now(),Date.now(),job.id);
          return send(response,200,{ok:true});
        }
        if(action==='failed'&&request.method==='POST') { coordinator.fail(job.id,'Не удалось создать модель. Попробуйте другой референс.');send(response,200,{ok:true});void coordinator.tick().catch(()=>{});return; }
        throw new HttpError(405,'Метод не поддерживается.');
      }
      if(!equalSecret(request.headers['x-model-service-secret'],config.secret))throw new HttpError(401,'Доступ запрещён.');
      if(path==='/internal/health'&&request.method==='GET')return send(response,200,{ok:true,generationEnabled:config.enabled,imageConfigured:Boolean(config.image),revision:config.engineRevision,cleanupPending:store.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE stop_state='pending'").get().n});
      const user=principal(request.headers);
      if(path==='/internal/jobs'&&request.method==='POST') {
        if(!user.admin)throw new HttpError(403,'Публичная платная генерация ещё не подключена.');
        if(!config.enabled)throw new HttpError(503,'Сервис 3D подготовлен, но генерация пока отключена.');
        const result=store.enqueue(user,await jsonBody(request),request.headers['idempotency-key']);
        send(response,result.reused?200:202,result);void coordinator.tick().catch(()=>{});return;
      }
      if(path==='/internal/assets'&&request.method==='GET')return send(response,200,{assets:store.list(user)});
      if(path==='/internal/catalog'&&request.method==='GET')return send(response,200,{assets:store.catalog(user)});
      const jobMatch=path.match(/^\/internal\/jobs\/([a-f0-9-]{36})$/);
      if(jobMatch&&request.method==='GET')return send(response,200,{job:publicJob(store.ownedJob(jobMatch[1],user))});
      const assetMatch=path.match(/^\/internal\/assets\/([a-f0-9-]{36})(?:\/(file|publish|grants))?$/);
      if(assetMatch) {
        const id=assetMatch[1],action=assetMatch[2];
        if(action==='publish'&&request.method==='POST') {
          if(!user.admin)throw new HttpError(403,'Доступ запрещён.');
          store.asset(id,user);
          const payload=await jsonBody(request);
          if(payload.rightsConfirmed!==true)throw new HttpError(400,'Нужно подтверждение прав на распространение модели.');
          store.db.prepare('UPDATE assets SET published=1,rights_confirmed=1 WHERE id=? AND ready_at IS NOT NULL').run(id);
          return send(response,200,{ok:true});
        }
        if(action==='grants'&&request.method==='POST') {
          // Accessible ONLY to server-side billing, never relayed from a browser route.
          if(!user.admin)throw new HttpError(403,'Доступ запрещён.');
          const payload=await jsonBody(request),buyer=principal({'x-model-tenant':payload.tenantId,'x-model-user':payload.userId});
          return send(response,200,{asset:store.grant(id,buyer,payload.receiptId)});
        }
        const asset=store.asset(id,user);
        if(request.method==='GET'&&!action)return send(response,200,{asset:store.metadata(asset)});
        if(request.method==='GET'&&action==='file') {
          const bytes=store.readReady(asset);
          response.writeHead(200,{'Content-Type':'model/gltf-binary','Content-Length':bytes.length,'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="roomdesign-${id}.glb"`,'X-Content-Type-Options':'nosniff','ETag':`"${asset.file_sha}"`});response.end(bytes);return;
        }
      }
      throw new HttpError(404,'Не найдено.');
    } catch(error) { send(response,error instanceof HttpError?error.status:500,{error:error instanceof HttpError?error.message:'Ошибка сервиса 3D.'});if(!(error instanceof HttpError))console.error('[model3d] request failed',error.name); }
  });
  server.requestTimeout=120000;server.headersTimeout=30000;
  return {server,coordinator};
}
export function startModelService() {
  const config=configFromEnv();
  if(config.secret.length<32)throw Error('Нужен MODEL3D_SERVICE_SECRET длиной от 32 символов.');
  if(!/^[a-z0-9-]{4,50}$/.test(config.namespace))throw Error('Некорректный MODEL3D_NAMESPACE.');
  if(config.enabled&&(!config.providerKey||!config.bundledWeights&&!config.hfToken||config.dailyBudgetUsd<=0||!config.maxPods))throw Error('Нужны API-ключи, суточный бюджет и лимит GPU.');
  const store=new ModelStore(config.root,{revision:config.engineRevision+'|'+config.image});
  const {server,coordinator}=createModelServer(config,store,new Runpod(config.providerKey));
  const timer=setInterval(()=>{if(config.providerKey)void coordinator.tick().catch(()=>console.error('[model3d] provider unavailable; cleanup will retry'));},10000);
  server.listen(config.port,'127.0.0.1',()=>console.info('[model3d] listening',config.port));
  for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{clearInterval(timer);server.close(()=>{store.close();process.exit(0);});});
  return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url)) startModelService();
