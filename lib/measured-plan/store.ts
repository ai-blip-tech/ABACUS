import {database} from '../server-runtime.ts';
import type {MeasureDoc} from './measure-model';

export function ensureMeasuredStore(){database.prepare(`CREATE TABLE IF NOT EXISTS measured_plans (
 project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL, tenant_id TEXT NOT NULL, revision INTEGER NOT NULL,
 document_json TEXT NOT NULL, updated_at TEXT NOT NULL
)`).execute();database.prepare('CREATE TABLE IF NOT EXISTS measured_plan_assets(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,asset TEXT NOT NULL,PRIMARY KEY(project_id,asset))').execute();}
const finite=(n:unknown,min=-200000,max=200000)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
const text=(s:unknown,max=240)=>typeof s==='string'&&s.length<=max;
const point=(p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(v=>finite(v));
const identifier=(s:unknown)=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,140}$/.test(s);
export function validateMeasuredDocument(value:unknown,projectId:string):MeasureDoc{
 const d=value as MeasureDoc;if(!d||d.schemaVersion!==1||!identifier(d.id)||!text(d.name)||!Array.isArray(d.walls)||d.walls.length>500||!Array.isArray(d.openings)||d.openings.length>1000||!Array.isArray(d.floor)||d.floor.length>1000||!d.floor.every(point)||!Array.isArray(d.zones)||d.zones.length>100)throw Error('Некорректная структура обмерного плана');
 const dimensionIds=new Set<string>();if(d.dimensions!==undefined){if(!Array.isArray(d.dimensions)||d.dimensions.length>500)throw Error('Слишком много дополнительных размеров');for(const m of d.dimensions){if(!identifier(m.id)||dimensionIds.has(m.id)||!point(m.a)||!point(m.b)||Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1])<1)throw Error('Некорректный дополнительный размер');dimensionIds.add(m.id);}}
 const ids=new Set<string>();for(const w of d.walls){if(!identifier(w.id)||ids.has(w.id)||!text(w.name)||!point(w.a)||!point(w.b)||!finite(w.thickness,0,1500)||!(w.height===null||finite(w.height,100,10000))||!['outer','inner'].includes(w.group)||typeof w.lengthConfirmed!=='boolean'||typeof w.thicknessConfirmed!=='boolean')throw Error('Некорректные параметры стены');ids.add(w.id);}
 const openingIds=new Set<string>();for(const o of d.openings){if(!identifier(o.id)||openingIds.has(o.id)||!ids.has(o.wallId)||!['door','window','opening'].includes(o.kind)||!finite(o.width,100,50000)||!finite(o.offset,0,300000)||!(o.height===null||finite(o.height,100,10000))||!(o.sill===null||finite(o.sill,0,10000))||(o.toCeiling!==undefined&&(typeof o.toCeiling!=='boolean'||(o.toCeiling&&o.kind!=='opening')))||typeof o.confirmed!=='boolean')throw Error('Некорректные параметры проёма');openingIds.add(o.id);}
 for(const z of d.zones)if(!identifier(z.id)||!text(z.name)||!Array.isArray(z.polygon)||z.polygon.length<3||z.polygon.length>500||!z.polygon.every(point)||!finite(z.elevation,-10000,10000)||!(z.height===null||finite(z.height,100,10000)))throw Error('Некорректная зона высот');
 const source=d.source as MeasureDoc['source']&{originalAsset?:string};
 if(!source||!text(source.name,300)||!['image/png','image/jpeg','application/pdf'].includes(source.mime)||!finite(source.width,1,16000)||!finite(source.height,1,16000)||!finite(source.pixelScale,.000001,100000)||!Number.isInteger(source.page)||!Number.isInteger(source.pages)||source.page<1||source.pages<source.page||source.pages>500||!Array.isArray(source.words)||source.words.length>10000||!text(source.hash,128)||!text(source.method,80))throw Error('Некорректный исходник');
 const prefix='/api/projects/'+encodeURIComponent(projectId)+'/assets/';
 if(typeof source.image!=='string'||!source.image.startsWith(prefix)||!/^[a-zA-Z0-9-]{1,100}$/.test(source.image.slice(prefix.length))||(source.originalAsset&&!/^measure-[a-zA-Z0-9-]+$/.test(source.originalAsset)))throw Error('Исходник должен принадлежать этому проекту');
 if(!(d.height===null||finite(d.height,100,10000))||!['unknown','uniform','different'].includes(d.heightMode)||!d.conflictNotes||Array.isArray(d.conflictNotes)||typeof d.conflictNotes!=='object'||Object.entries(d.conflictNotes).some(([k,v])=>!text(k,160)||!text(v,2000)))throw Error('Некорректные параметры высот и проверки');
 for(const key of ['floorConfirmed','scaleConfirmed','geometryReviewed','drawingReviewed'] as const)if(typeof d[key]!=='boolean')throw Error('Некорректный статус подтверждения');
 return JSON.parse(JSON.stringify(d));
}
export function writeMeasuredPlan(projectId:string,userId:string,tenantId:string,revision:number,doc:MeasureDoc){
 ensureMeasuredStore();return database.transaction(db=>{
  if(!db.prepare('SELECT id FROM projects WHERE id=? AND user_id=? AND tenant_id=?').get(projectId,userId,tenantId))throw Error('Проект не найден');
  const old=db.prepare('SELECT revision FROM measured_plans WHERE project_id=? AND user_id=? AND tenant_id=?').get(projectId,userId,tenantId) as {revision:number}|undefined;
  if((old?.revision||0)!==revision)return null;
  const next=revision+1,now=new Date().toISOString();
  db.prepare('INSERT INTO measured_plans(project_id,user_id,tenant_id,revision,document_json,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET revision=excluded.revision,document_json=excluded.document_json,updated_at=excluded.updated_at').run(projectId,userId,tenantId,next,JSON.stringify(doc),now);
  db.prepare('UPDATE projects SET updated_at=? WHERE id=? AND user_id=? AND tenant_id=?').run(now,projectId,userId,tenantId);return next;
 });
}
