import {requireTenantUser} from '@/lib/auth';
import {materialProposalSnapshot} from '@/lib/material-board/proposal';
import {asWorkbook} from '@/lib/material-board/workbook';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import {database} from '@/lib/server-runtime';

export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
const validProjectId=(id:string)=>/^[a-zA-Z0-9-]{12,100}$/.test(id);

export async function POST(request:Request,{params}:Context){
 const user=await requireTenantUser(request);if(!user)return Response.json({error:'Требуется вход'},{status:401});
 if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник запроса'},{status:403});
 const previewTenant=process.env.NODE_ENV!=='production'&&request.headers.get('x-roomdesign-preview-tenant')==='norrmobler';
 if(user.tenantSlug!=='norrmobler'&&!previewTenant)return Response.json({error:'Коммерческое предложение Norrmobler доступно только менеджерам этого тенанта.'},{status:403});
 const{id}=await params;if(!validProjectId(id))return Response.json({error:'Некорректный проект'},{status:400});
 const project=await database.prepare('SELECT state_json FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{state_json:string|null}>();
 if(!project)return Response.json({error:'Проект не найден'},{status:404});
 const saved=await database.prepare('SELECT document_json,revision FROM material_boards WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{document_json:string;revision:number}>();
 if(!saved&&!previewTenant)return Response.json({error:'Сначала сохраните листы раздела «Концепция и материалы».'},{status:400});
 try{
  const body=await request.json().catch(()=>({})) as {workbook?:unknown;selectedIds?:unknown};
  const workbook=previewTenant&&body.workbook?asWorkbook(body.workbook):saved?asWorkbook(JSON.parse(saved.document_json)):null;if(!workbook)throw Error('Повреждена структура листов песочницы');
  const selectedIds=Array.isArray(body.selectedIds)?body.selectedIds.filter((value):value is string=>typeof value==='string'&&value.length>0&&value.length<=120).slice(0,100):[];
  if(!selectedIds.length)throw Error('Выберите товары или результаты, которые нужно добавить в коммерческое предложение.');
  const snapshot=materialProposalSnapshot(workbook,selectedIds),fallback=snapshot.items.find(item=>item.referenceImage)?.referenceImage;
  if(!snapshot.items.length&&!snapshot.visualizations.length)throw Error('В выбранных карточках нет данных для коммерческого предложения.');
  const visualizations=snapshot.visualizations.length?snapshot.visualizations:fallback?[{id:'materials-product-preview',title:'Результат концепции',image:fallback,resultType:'material-variant' as const}]:[];
  const state=project.state_json?JSON.parse(project.state_json) as Record<string,unknown>:{};
  state.materialsProposalItems=snapshot.items;
  state.materialsProposalVisualizations=visualizations;
  state.materialsProposalSourceRevision=saved?.revision??0;
  state.materialsProposalSelectionIds=selectedIds;
  if(typeof state.materialsProposalShowPrices!=='boolean')state.materialsProposalShowPrices=true;
  await database.prepare('UPDATE projects SET state_json=?,updated_at=? WHERE id=? AND user_id=? AND tenant_id=?').bind(JSON.stringify(state),new Date().toISOString(),id,user.id,user.tenantId).run();
  return Response.json({ok:true,itemCount:snapshot.items.length,visualizationCount:visualizations.length,items:snapshot.items.map(item=>({id:item.id,name:item.referenceName||item.name,article:item.referenceArticle||'',brand:item.referenceBrand||'',image:item.referenceImage||''})),visualizations},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Не удалось подготовить коммерческое предложение.'},{status:400});}
}
