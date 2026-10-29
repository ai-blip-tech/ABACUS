import {requireTenantUser} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {readAlbum} from '@/lib/planning-plan/variants';
import {planningPDF} from '@/lib/planning-plan/print';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await requireTenantUser(request);if(!user)return new Response('Требуется вход',{status:401});const{id}=await params;
 const project=await database.prepare('SELECT name FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{name:string}>();if(!project)return new Response('Проект не найден',{status:404});
 if(!await database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='planning_plans'").first())return new Response('Сначала сохраните планировку',{status:404});
 const row=await database.prepare('SELECT document_json FROM planning_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{document_json:string}>();if(!row)return new Response('Сначала сохраните планировку',{status:404});
 try{const plan=readAlbum(JSON.parse(row.document_json)).variants.manual!.plan;const bytes=await planningPDF(plan,project.name);return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="planning-plan.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}catch(e){return new Response(e instanceof Error?e.message:'Не удалось сформировать альбом',{status:500});}
}
