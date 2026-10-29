'use client';
import {useEffect,useRef,useState} from 'react';
import EditorHeader from '../editor-header';
import MeasureApp,{type MeasureEditorControl} from '../measured-plan/editor/measure-app';
import {PlanningSaveQueue} from '@/lib/planning-plan/save-queue';
import {manualSourceMode,manualSheetIndex,type PlanningSourceMode} from '@/lib/planning-plan/manual-workspace';
import type {PlanningAlbum} from '@/lib/planning-plan/variants';
import {hasMeasuredGeometry,type PlanningDoc} from '@/lib/planning-plan/model';
import './planning.css';
import './manual-workspace.css';
type User={email:string;firstName:string;lastName:string;role:'user'|'admin'};
export default function PlanningPlanPage(){
 const[user,setUser]=useState<User|null>(null),[project,setProject]=useState<{id:string;name:string}|null>(null),[album,setAlbum]=useState<PlanningAlbum|null>(null),[measured,setMeasured]=useState<PlanningDoc|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false),[notice,setNotice]=useState('');
 const queue=useRef<PlanningSaveQueue<PlanningAlbum>|null>(null),editor=useRef<MeasureEditorControl>(null),locked=useRef(false);
 const cadInput=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(!notice||busy)return;const timer=window.setTimeout(()=>setNotice(''),15_000);return()=>window.clearTimeout(timer);},[notice,busy]);
 useEffect(()=>{const c=new AbortController();async function load(){try{
  const id=new URLSearchParams(location.search).get('project');if(!id)throw Error('Выберите проект');
  const auth=await fetch('/api/auth/me',{signal:c.signal,cache:'no-store'}).then(r=>r.json());if(!auth.user)throw Error('Войдите в Room Design');
  const response=await fetch(`/api/projects/${encodeURIComponent(id)}/planning-plan`,{signal:c.signal,cache:'no-store'}),data=await response.json();if(!response.ok)throw Error(data.error);if(c.signal.aborted)return;
  const q=new PlanningSaveQueue<PlanningAlbum>(data.revision,async body=>{const r=await fetch(`/api/projects/${encodeURIComponent(id)}/planning-plan`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{...await r.json(),ok:r.ok,status:r.status};});
  queue.current=q;setUser(auth.user);setProject(data.project);setMeasured(data.bases.measured);
  if(data.document){if(!data.document.manualWorkspace&&!hasMeasuredGeometry(data.document.variants.manual?.plan)&&!data.document.variants.manual?.plan.furniture?.length&&data.bases.measured){const result=await q.request('workspace-source',{mode:'measured'});if(!c.signal.aborted)setAlbum(result.document);}else setAlbum(data.document);}else{const result=await q.request('start-manual',{baseKind:data.bases.measured?'measured':'manual'});if(!c.signal.aborted)setAlbum(result.document);}
 }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'Не удалось загрузить планировку');}finally{if(!c.signal.aborted)setLoaded(true);}}void load();return()=>c.abort();},[]);
 async function request(action:string,payload:Record<string,unknown>={}){if(!queue.current)throw Error('Проект ещё загружается');const r=await queue.current.request(action,payload);setAlbum(r.document);return r.document;}
 async function sheet(index:number){if(locked.current||!album||index===manualSheetIndex(album))return;locked.current=true;setBusy(true);setError('');try{if(editor.current?.hasUnsavedChanges())await editor.current.flush();await request('workspace-sheet',{index});}catch(e){setError(e instanceof Error?e.message:'Не удалось открыть лист. Текущие правки сохранены в редакторе.');}finally{setBusy(false);locked.current=false;}}
 async function source(mode:PlanningSourceMode,refresh=false){if(locked.current||!album)return;locked.current=true;setBusy(true);setError('');try{
  await editor.current?.flush();
  await request('workspace-source',{mode,refresh});setNotice(mode==='measured'?'Рабочая копия обмерного плана. Исходный этап не меняется.':mode==='archicad'?'Рабочая копия DXF. Все инструменты редактирования доступны.':'Самостоятельное построение: используйте «Возвести перегородку» или «Дополнительные настройки → Стена».');
 }catch(e){setError(e instanceof Error?e.message:'Не удалось сменить основу');}finally{setBusy(false);locked.current=false;}}
 async function importCad(file:File){if(locked.current)return;locked.current=true;setBusy(true);setError('');setNotice('Открываем '+file.name+'…');try{if(!queue.current||!project)throw Error('Проект ещё загружается');if(!/\.(dwg|dxf)$/i.test(file.name)||!file.size||file.size>2_000_000)throw Error('Выберите DWG или DXF размером до 2 МБ.');if(editor.current?.hasUnsavedChanges())await editor.current.flush();const form=new FormData();form.append('file',file);const response=await fetch(`/api/projects/${encodeURIComponent(project.id)}/planning-plan/cad-file`,{method:'POST',body:form}),data=await response.json();if(!response.ok)throw Error(data.error||'Не удалось прочитать файл');const result=await queue.current.importLatest({text:data.text,fileName:data.fileName,options:data.options,confirmed:true},async()=>{const r=await fetch(`/api/projects/${encodeURIComponent(project.id)}/planning-plan`,{cache:'no-store'}),latest=await r.json();if(!r.ok)throw Error(latest.error||'Не удалось обновить данные проекта');return latest.revision;},()=>editor.current?.hasUnsavedChanges()??true);setAlbum(result.document);setNotice(file.name+' открыт в редакторе. Предыдущая рабочая версия сохранена в архиве. '+(Array.isArray(data.warnings)?data.warnings.join(' '):''));}catch(e){setNotice('');setError(e instanceof Error?e.message:'Не удалось импортировать. Текущая планировка не изменена.');}finally{setBusy(false);locked.current=false;}}
 const menu=()=>location.assign(project?'/?project='+project.id+'&stage=planning#меню-проекта':'/#кабинет');
 const header=<EditorHeader user={user} projectName={project?.name||'Планировочное решение'} sectionName="Планировочное решение" onHome={()=>location.assign('/')} onProjectMenu={menu} onLogin={()=>location.assign('/#кабинет')}/>;
 if(!album||!project)return <main className="planning-start">{header}<section><h1>Планировочное решение</h1>{error?<p role="alert">{error}</p>:<p role="status">{loaded?'Выберите проект':'Открываем рабочую область…'}</p>}</section></main>;
 const plan=album.variants.manual!.plan,mode=manualSourceMode(album);
 const sheetControls=<div className="planning-sheet-tabs" role="tablist" aria-label="Листы текущего режима">{[0,1,2].map(index=><button key={index} role="tab" aria-selected={manualSheetIndex(album)===index} disabled={busy} onClick={()=>void sheet(index)}>Лист {index+1}</button>)}</div>;
 const modes=<div className="partition-tabs planning-source-tabs" role="tablist" aria-label="Основа планировочного решения">
  <button role="tab" aria-selected={mode==='measured'} disabled={busy||!measured} title={!measured?'Сначала сохраните обмерный план этого проекта':undefined} onClick={()=>{if(mode!=='measured')void source('measured');}}>Обмерный план</button>
  <button role="tab" aria-selected={mode==='archicad'} disabled={busy} title="Загрузить DWG или DXF и сразу открыть в редакторе" onClick={()=>{if(mode!=='archicad'&&album.manualWorkspace?.drafts.archicad)void source('archicad');else cadInput.current?.click();}}>Импорт из ArchiCAD <small>DWG · DXF</small></button>
  <button role="tab" aria-selected={mode==='manual'} disabled={busy} onClick={()=>{if(mode!=='manual')void source('manual');}}>Нарисовать самостоятельно</button>
 </div>;
 return <><input ref={cadInput} type="file" hidden accept=".dwg,.dxf" aria-label="Загрузить DWG или DXF" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importCad(file);}}/><MeasureApp key={plan.id} workspace="planning" initialDoc={plan} projectId={project.id} projectName={project.name} header={header} workspaceToolbar={modes} workspaceSheetControls={sheetControls} editorControl={editor} interactionLocked={busy} workspaceNotice={<>{error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}</>} onSave={async plan=>{await request('workspace-save',{plan});}}/></>;
}
