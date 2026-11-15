import {randomUUID} from 'node:crypto';
import {ensureStore,requireTenantUser,storage,tenantStoragePrefix} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import {POST as generatePreview} from '@/app/api/material-board/generate-preview/route';
import {POST as generateProduction} from '@/app/api/generate/route';
import {cameraRenderPrompt} from '@/lib/visualizations/brief.mjs';
import {addPlannerRender} from '@/lib/material-board/planner-render';
import {ensureMaterialsStore} from '@/lib/material-board/server-store';
export const runtime='nodejs';export const maxDuration=240;
type Context={params:Promise<{id:string}>};
function store(){database.prepare('CREATE TABLE IF NOT EXISTS project_visualizations(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,status TEXT NOT NULL,source_asset TEXT NOT NULL,render_asset TEXT,manifest_json TEXT NOT NULL,created_at TEXT NOT NULL,error TEXT)').execute();database.prepare('CREATE TABLE IF NOT EXISTS deleted_project_visualizations(id TEXT PRIMARY KEY REFERENCES project_visualizations(id) ON DELETE CASCADE,deleted_at TEXT NOT NULL)').execute();}
async function owner(request:Request,id:string){await ensureStore();const u=await requireTenantUser(request);if(!u)return null;const p=await database.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,u.id,u.tenantId).first();return p?u:null;}
const decode=(s:string)=>{const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(s);if(!m)throw Error('Некорректное изображение');const bytes=Buffer.from(m[2],'base64');if(!bytes.length||bytes.length>15_000_000)throw Error('Изображение превышает 15 МБ');return {bytes,type:'image/'+m[1]};};
export async function GET(request:Request,{params}:Context){const{id}=await params,u=await owner(request,id);if(!u)return Response.json({error:'Проект не найден или требуется вход'},{status:404});store();const rows=await database.prepare('SELECT v.id,v.status,v.source_asset,v.render_asset,v.created_at,v.error,d.deleted_at FROM project_visualizations v LEFT JOIN deleted_project_visualizations d ON d.id=v.id WHERE v.project_id=? AND v.user_id=? AND v.tenant_id=? ORDER BY v.created_at DESC').bind(id,u.id,u.tenantId).all();const all=rows.results.map((r:any)=>({...r,image:r.render_asset?`/api/projects/${id}/assets/${r.render_asset}`:null,source:`/api/projects/${id}/assets/${r.source_asset}`}));return Response.json({items:all.filter((r:any)=>!r.deleted_at),trash:all.filter((r:any)=>r.deleted_at)},{headers:{'Cache-Control':'no-store'}});}
async function changeVisibility(request:Request,context:Context,remove:boolean){if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник'},{status:403});const{id}=await context.params,u=await owner(request,id);if(!u)return Response.json({error:'Проект не найден или требуется вход'},{status:404});store();try{const body=await request.json();if(!/^[a-f0-9-]{36}$/.test(body.id||''))return Response.json({error:'Некорректная визуализация'},{status:400});const row=await database.prepare('SELECT id FROM project_visualizations WHERE id=? AND project_id=? AND user_id=? AND tenant_id=?').bind(body.id,id,u.id,u.tenantId).first();if(!row)return Response.json({error:'Визуализация не найдена'},{status:404});if(remove)await database.prepare('INSERT INTO deleted_project_visualizations(id,deleted_at) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET deleted_at=excluded.deleted_at').bind(body.id,new Date().toISOString()).run();else await database.prepare('DELETE FROM deleted_project_visualizations WHERE id=?').bind(body.id).run();return Response.json({ok:true});}catch{return Response.json({error:'Не удалось изменить визуализацию'},{status:400});}}
export async function DELETE(request:Request,context:Context){return changeVisibility(request,context,true);}
export async function PATCH(request:Request,context:Context){return changeVisibility(request,context,false);}

export async function POST(request:Request,{params}:Context){
 if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник'},{status:403});
 const {id}=await params,user=await owner(request,id);
 if(!user)return Response.json({error:'Проект не найден или требуется вход'},{status:404});
 store();
 let claimedJob:string|undefined;
 const key=(asset:string)=>`${tenantStoragePrefix(user)}/projects/${id}/${asset}`;
 const getJob=(job:string)=>database.prepare('SELECT status,error FROM project_visualizations WHERE id=? AND project_id=? AND user_id=? AND tenant_id=?')
  .bind(job,id,user.id,user.tenantId).first<{status:string;error:string|null}>();
 const respondToExisting=(job:string,existing:{status:string;error:string|null})=>existing.status==='error'
  ? Response.json({error:existing.error||'Не удалось создать рендер'},{status:400})
  : Response.json({id:job,status:existing.status},{status:existing.status==='ready'?200:202});
 try{
  const body=await request.json(),job=body.id;
  if(typeof job!=='string'||!/^[a-f0-9-]{36}$/.test(job))throw Error('Не указан идентификатор снимка');
  const existing=await getJob(job);
  if(existing)return respondToExisting(job,existing);
  if(!body.manifest||JSON.stringify(body.manifest).length>1_000_000||!Array.isArray(body.references)||body.references.length>10)throw Error('Некорректные материалы сцены');
  const source=decode(body.image);
  for(const ref of body.references)decode(ref);
  const sourceAsset='visual-source-'+randomUUID();
  await storage().put(key(sourceAsset),source.bytes,{httpMetadata:{contentType:source.type}});
  const inserted=await database.prepare(`INSERT INTO project_visualizations(id,project_id,user_id,tenant_id,status,source_asset,manifest_json,created_at)
   VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING`)
   .bind(job,id,user.id,user.tenantId,'rendering',sourceAsset,JSON.stringify(body.manifest),new Date().toISOString()).run();
  if(!inserted.meta.changes){
   await storage().delete(key(sourceAsset));
   const duplicate=await getJob(job);
   if(duplicate)return respondToExisting(job,duplicate);
   return Response.json({error:'Идентификатор снимка уже используется'},{status:409});
  }
  claimedJob=job;
  const prompt=cameraRenderPrompt(body.manifest);
  const local=process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(new URL(request.url).hostname);
  const headers=new Headers(request.headers);
  headers.set('Content-Type','application/json');
  headers.set('Idempotency-Key',job);
  headers.set('X-Disable-Generation-Retry','1');
  headers.delete('content-length');
  const outputSize=body.outputSize==='1024x1536'?'1024x1536':'1536x1024';
  const generated=await (local?generatePreview:generateProduction)(
   new Request(new URL(local?'/api/material-board/generate-preview':'/api/generate',request.url),{
    method:'POST',headers,body:JSON.stringify({
     projectId:id,operation:'global_edit',prompt,roomImage:body.image,outputSize,
     templateEdit:{templateId:'room-design-planner-camera',instructions:prompt,referenceImages:body.references,outputLabel:'Визуализация Room Design Planner'},
    }),
   }),
  );
  if(!generated.ok){
   const error=await generated.json().catch(()=>({}));
   throw Error(error.error||'Не удалось создать рендер');
  }
  const bytes=new Uint8Array(await generated.arrayBuffer()),asset='visual-render-'+randomUUID();
  if(!bytes.length)throw Error('Сервис вернул пустое изображение');
  await storage().put(key(asset),bytes,{httpMetadata:{contentType:generated.headers.get('content-type')||'image/webp'}});
  const image=`/api/projects/${id}/assets/${asset}`;
  ensureMaterialsStore();
  database.transaction(db=>{
   addPlannerRender(db,user,id,job,image,outputSize==='1024x1536');
   db.prepare("UPDATE project_visualizations SET status='ready',render_asset=? WHERE id=? AND project_id=? AND user_id=? AND tenant_id=?")
    .run(asset,job,id,user.id,user.tenantId);
  });
  return Response.json({id:job,status:'ready',image});
 }catch(error){
  const message=(error as Error).message;
  if(claimedJob)await database.prepare("UPDATE project_visualizations SET status='error',error=? WHERE id=? AND project_id=? AND user_id=? AND tenant_id=?")
   .bind(message.slice(0,500),claimedJob,id,user.id,user.tenantId).run();
  return Response.json({error:message},{status:400});
 }
}
