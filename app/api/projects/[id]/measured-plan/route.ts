import {requireTenantUser,ensureStore} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {ensureMeasuredStore,validateMeasuredDocument,writeMeasuredPlan} from '@/lib/measured-plan/store';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Требуется вход'},{status:401});
 const {id}=await params;const project=await database.prepare('SELECT id,name FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first();if(!project)return Response.json({error:'Проект не найден'},{status:404});
 ensureMeasuredStore();const saved=await database.prepare('SELECT document_json,revision FROM measured_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{document_json:string,revision:number}>();
 return Response.json({project,document:saved?JSON.parse(saved.document_json):null,revision:saved?.revision||0},{headers:{'Cache-Control':'private, no-store'}});
}
export async function PUT(request:Request,{params}:Context){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Требуется вход'},{status:401});
 const {id}=await params;const project=await database.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first();if(!project)return Response.json({error:'Проект не найден'},{status:404});
 if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник запроса'},{status:403});
 try{const raw=await request.text();if(raw.length>2_000_000)return Response.json({error:'План слишком большой'},{status:413});const body=JSON.parse(raw);if(!Number.isInteger(body.revision)||body.revision<0)throw Error('Нужна версия плана');const doc=validateMeasuredDocument(body.document,id);await ensureStore();const revision=writeMeasuredPlan(id,user.id,user.tenantId,body.revision,doc);if(revision===null)return Response.json({error:'План изменён в другой вкладке. Сохранение остановлено — обновите страницу перед продолжением.'},{status:409});return Response.json({revision},{headers:{'Cache-Control':'no-store'}});}catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось сохранить план'},{status:400});}
}
