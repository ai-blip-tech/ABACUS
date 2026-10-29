import {restoreManualDraft,switchManualSource,importManualDxf,withManualSheets,switchManualSheet} from '@/lib/planning-plan/manual-workspace';
import {parseDxf,convertDxf} from '@/lib/planning-plan/dxf-import';
import {auditDxf} from '@/lib/planning-plan/dxf-audit';
import {createHash} from 'node:crypto';
import {requireTenantUser} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {isSameOrigin} from '@/lib/measured-plan/request-origin';
import {ensureMeasuredStore,validateMeasuredDocument} from '@/lib/measured-plan/store';
import {ensurePartitionStore} from '@/lib/partition-plan/store';
import {hasMeasuredGeometry,manualPlanning,planningFromMeasured,planningFromInstallation,type PlanningDoc} from '@/lib/planning-plan/model';
import {createAlbum,readAlbum,saveVariant,type PlanningAlbum} from '@/lib/planning-plan/variants';
export const runtime='nodejs';
type Context={params:Promise<{id:string}>};
type Row={revision:number;document_json:string};
function ensure(){database.prepare('CREATE TABLE IF NOT EXISTS planning_plans(project_id TEXT NOT NULL,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,revision INTEGER NOT NULL,document_json TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(project_id,user_id,tenant_id))').execute();ensureMeasuredStore();ensurePartitionStore();}
function bases(measured:Row|null|undefined,partition:Row|null|undefined){const plan=measured?JSON.parse(measured.document_json):null;return{measured:hasMeasuredGeometry(plan)?planningFromMeasured(plan,measured!.revision):null,installation:partition?planningFromInstallation(JSON.parse(partition.document_json),partition.revision):null,manual:manualPlanning()};}
function restored(value:PlanningAlbum|PlanningDoc,source:ReturnType<typeof bases>){return withManualSheets(readAlbum(value,value.source.kind==='installation'?source.installation?.plan:value.source.kind==='measured'?source.measured?.plan:undefined),source);}
export async function GET(request:Request,{params}:Context){
 const u=await requireTenantUser(request);if(!u)return Response.json({error:'Требуется вход'},{status:401});const{id}=await params;
 const project=await database.prepare('SELECT id,name,description,project_type FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,u.id,u.tenantId).first();if(!project)return Response.json({error:'Проект не найден'},{status:404});ensure();
 const row=await database.prepare('SELECT revision,document_json FROM planning_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,u.id,u.tenantId).first<Row>();
 const measured=await database.prepare('SELECT revision,document_json FROM measured_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,u.id,u.tenantId).first<Row>();
 const partition=await database.prepare('SELECT revision,document_json FROM partition_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,u.id,u.tenantId).first<Row>();
 const source=bases(measured,partition);
 return Response.json({project,document:row?restored(JSON.parse(row.document_json),source):null,revision:row?.revision||0,bases:source},{headers:{'Cache-Control':'private, no-store'}});
}
export async function PUT(request:Request,{params}:Context){
 const u=await requireTenantUser(request);if(!u)return Response.json({error:'Требуется вход'},{status:401});if(!isSameOrigin(request))return Response.json({error:'Недопустимый источник'},{status:403});const{id}=await params;
 if(!await database.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,u.id,u.tenantId).first())return Response.json({error:'Проект не найден'},{status:404});
 try{
  const raw=await request.text();if(raw.length>6000000)throw Error('План слишком большой');const b=JSON.parse(raw);if(!Number.isSafeInteger(b.revision)||b.revision<0)throw Error('Не указана версия');ensure();
  const result=database.transaction(db=>{
   const old=db.prepare('SELECT revision,document_json FROM planning_plans WHERE project_id=? AND user_id=? AND tenant_id=?').get(id,u.id,u.tenantId) as Row|undefined;if((old?.revision||0)!==b.revision)return null;
   const measured=db.prepare('SELECT revision,document_json FROM measured_plans WHERE project_id=? AND user_id=? AND tenant_id=?').get(id,u.id,u.tenantId) as Row|undefined;
   const partition=db.prepare('SELECT revision,document_json FROM partition_plans WHERE project_id=? AND user_id=? AND tenant_id=?').get(id,u.id,u.tenantId) as Row|undefined;
   const source=bases(measured,partition);let document:PlanningAlbum;
   if(!old){
    if(!['start-manual','manual','from-installation','from-measured'].includes(b.action))throw Error('Выберите режим планирования');
    const kind=b.action==='manual'?'manual':b.action==='from-installation'?'installation':b.action==='from-measured'?'measured':b.baseKind||'measured';
    if(!['manual','installation','measured'].includes(kind))throw Error('Некорректная основа');const base=source[kind as keyof typeof source];if(!base)throw Error('Сначала сохраните выбранный исходный этап');document=createAlbum(base);
   }else{
    document=restored(JSON.parse(old.document_json),source);
    const validate=(value:unknown)=>validateMeasuredDocument(value,id,{allowManualSource:true});
    if(b.action==='workspace-save')document={...saveVariant(document,'manual',b.plan,validate),activeVariantId:'manual',selected:null};
    else if(b.action==='workspace-source')document=switchManualSource(document,b.mode,source,b.refresh===true);
    else if(b.action==='workspace-sheet')document=switchManualSheet(document,b.index);
    else if(b.action==='workspace-import-dxf'){
     if(b.confirmed!==true||typeof b.fileName!=='string'||!b.fileName.toLowerCase().endsWith('.dxf')||b.fileName.length>240)throw Error('Подтвердите предварительный просмотр файла DXF.');
     const scene=parseDxf(b.text),result=convertDxf(scene,b.options,b.fileName);
     if(!hasMeasuredGeometry(result.plan))throw Error('Нет распознанных стен или колонн. Проверьте назначение слоёв.');
     result.plan.scaleConfirmed=true;result.plan.source.hash='dxf-'+createHash('sha256').update(b.text).digest('hex');
     result.plan.conflictNotes.dxfImport=JSON.stringify({units:b.options.unit,origin:result.origin,axes:'x-right,y-down; original y-up',warnings:result.warnings.slice(0,6).map(w=>w.slice(0,180))});
     result.plan.conflictNotes.dxfAudit=JSON.stringify(auditDxf(scene,result,b.options.unit));
     document=importManualDxf(document,validate(result.plan));
    }
    else if(b.action==='workspace-restore')document=restoreManualDraft(document,b.index);
    else if(b.action==='save'&&b.document?.version===1)document=saveVariant(document,'manual',b.document.plan,validate);
    else throw Error('Неизвестное действие. Существующая планировка не заменена.');
   }
   document=withManualSheets(document,source);
   const revision=(old?.revision||0)+1;
   db.prepare('INSERT INTO planning_plans(project_id,user_id,tenant_id,revision,document_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id,user_id,tenant_id) DO UPDATE SET revision=excluded.revision,document_json=excluded.document_json,updated_at=excluded.updated_at').run(id,u.id,u.tenantId,revision,JSON.stringify(document),new Date().toISOString());
   db.prepare('UPDATE projects SET updated_at=? WHERE id=? AND user_id=? AND tenant_id=?').run(new Date().toISOString(),id,u.id,u.tenantId);return{document,revision};
  });
  if(!result)return Response.json({error:'План изменён в другой вкладке. Сохранение остановлено; обновите страницу.'},{status:409});return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Не удалось сохранить'},{status:400});}
}
