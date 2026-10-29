import {requireTenantUser} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import {readCadFile} from '@/lib/planning-plan/cad-file';
import {parseDxf,defaultDxfRoles} from '@/lib/planning-plan/dxf-import';
export const runtime='nodejs';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Требуется вход'},{status:401});
 if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник'},{status:403});const{id}=await params;
 if(!await database.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first())return Response.json({error:'Проект не найден'},{status:404});
 try{const reader=request.body?.getReader();if(!reader)throw Error('Файл не передан');const chunks:Uint8Array[]=[];let length=0;for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2_100_000){await reader.cancel();throw Error('Выберите файл до 2 МБ.');}chunks.push(part.value);}const body=new Uint8Array(length);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  const form=await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type')||''}}).formData(),file=form.get('file');if(!(file instanceof File))throw Error('Выберите DWG или DXF.');
  const result=await readCadFile(new Uint8Array(await file.arrayBuffer()),file.name),scene=parseDxf(result.text);if(!scene.unit)throw Error('В файле не указаны единицы измерения. Экспортируйте план с единицами в миллиметрах.');
  return Response.json({...result,options:{unit:scene.unit,roles:defaultDxfRoles(scene),axisThickness:100},confirmed:true},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось прочитать CAD-файл. Планировка не изменена.'},{status:400});}
}
