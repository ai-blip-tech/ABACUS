'use client';
import {useEffect,useRef,useState} from 'react';
import AccountDropdown from './account-dropdown';
import ProjectBriefEditor,{type BriefProject} from './project-brief-editor';
import './project-stage-workspace.css';

type User={id:string;email:string;firstName:string;lastName:string;role:'user'|'admin';phone:string;companyRole:string};
import {projectStages as baseStages,projectStageFrameUrl} from '@/lib/project-stage-routing';
export default function ProjectStageWorkspace({user,projectId,projectName,projectType,onHome,onProjects,onBriefSaved}:{user:User|null;projectId:string;projectName:string;projectType:string;onHome:()=>void;onProjects:()=>void;onBriefSaved:(project:BriefProject)=>void}){
 const hasPlanningSubstages=true;
 const wallPreview=true;
 const [substepsOpen,setSubstepsOpen]=useState(false);
 const stages:(typeof baseStages[number]&{parentId?:string;substage?:'floor'|'floor2'|'walls'})[]=hasPlanningSubstages?baseStages.flatMap(stage=>stage.id==='planning'?[stage,{id:'planning-floor-2',label:'Напольное покрытие',path:'/planning-floor-2',parentId:'planning',substage:'floor2'},...(wallPreview?[{id:'planning-walls',label:'Декорирование стен',path:'/planning-walls',parentId:'planning',substage:'walls' as const}]:[])]:[stage]):baseStages;
 const [selected,setSelected]=useState('sources');
 const [opened,setOpened]=useState<string[]>([]);
 const [loaded,setLoaded]=useState<string[]>([]);
 const [fullscreenStage,setFullscreenStage]=useState<string|null>(null);
 const [previewTenant,setPreviewTenant]=useState('');
 const frames=useRef(new Map<string,HTMLIFrameElement>());
 useEffect(()=>{const message=(event:MessageEvent)=>{if(event.origin!==location.origin)return;const entry=[...frames.current].find(([,frame])=>frame.contentWindow===event.source);if(!entry)return;if(event.data?.type==='roomdesign:floor-coverings-updated')for(const target of ['planning','planning-walls'])frames.current.get(target)?.contentWindow?.postMessage({type:'roomdesign:floor-coverings-updated'},location.origin);if(event.data?.type==='roomdesign:stage-open'&&event.data.stage==='planning')select('planning');if(event.data?.type==='roomdesign:stage-ready')setLoaded(current=>current.includes(entry[0])?current:[...current,entry[0]]);if(event.data?.type==='roomdesign:stage-fullscreen')setFullscreenStage(event.data.expanded?entry[0]:current=>current===entry[0]?null:current);};window.addEventListener('message',message);return()=>window.removeEventListener('message',message);},[]);
 const [brief,setBrief]=useState(false);
 const select=(id:string,push=true)=>{
  if(hasPlanningSubstages&&id==='planning-floor')id='planning-floor-2';
  if(!stages.some(stage=>stage.id===id))return;
  setSelected(id);frames.current.get(id)?.contentWindow?.postMessage({type:'roomdesign:stage-active'},location.origin);if(push&&id.startsWith('planning-'))setSubstepsOpen(true);setFullscreenStage(null);setOpened(current=>current.includes(id)?current:[...current,id]);
  const url=new URL(location.href);url.searchParams.set('stage',id);url.hash='меню-проекта';
  if(push)history.pushState({projectId,norrView:'projectMenu'},'',url);
  try{localStorage.setItem(`roomdesign:last-stage:${projectId}`,id);}catch{/* Navigation still works without local storage. */}
 };
 useEffect(()=>{
  if(process.env.NODE_ENV!=='production')setPreviewTenant(new URLSearchParams(location.search).get('previewTenant')||'');
 },[]);
 useEffect(()=>{
  const restore=()=>{let saved='sources';try{saved=localStorage.getItem(`roomdesign:last-stage:${projectId}`)||saved;}catch{}
   const value=new URLSearchParams(location.search).get('stage')||saved;const requested=hasPlanningSubstages&&value==='planning-floor'?'planning-floor-2':value;
   select(stages.some(stage=>stage.id===requested)?requested:'sources',false);};
  restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
 },[projectId,hasPlanningSubstages,wallPreview]);
 const active=stages.find(stage=>stage.id===selected)!;
 const frameUrl=(stage:typeof stages[number])=>{const source=stage.substage==='walls'?'/planning-walls?project='+encodeURIComponent(projectId)+'&embeddedStage=1':stage.substage==='floor2'?'/planning-floor-2?project='+encodeURIComponent(projectId)+'&embeddedStage=1':projectStageFrameUrl(stage.parentId||stage.id,projectId)!;const url=new URL(source,location.origin);if(stage.substage){url.searchParams.set('substage',stage.substage);}if(!previewTenant)return url.pathname+url.search;url.searchParams.set('previewTenant',previewTenant);return `${url.pathname}${url.search}`;};
 return <main className={`project-menu-preview project-stage-workspace${active.path?' has-workspace':''}${fullscreenStage===selected?' is-stage-fullscreen':''}`}>
  <header className="project-menu-header">
   <button className="project-menu-wordmark room-design-wordmark" type="button" onClick={onHome}>ROOM DESIGN</button>
   <nav aria-label="Путь проекта"><button onClick={onProjects}>Проекты</button><span>›</span><b>{projectName}</b><span>›</span>{active.parentId&&<><button type="button" onClick={()=>select(active.parentId!)}>Планировочное решение</button><span>›</span></>}<em>{active.label}</em></nav>
   <div className="project-menu-account">{user&&<AccountDropdown user={user} dashboard/>}</div>
  </header>
  <div className="project-stage-layout">
   <aside className="project-menu-sidebar" aria-label="Этапы проекта">
    <div className="project-menu-summary"><span>ДИЗАЙН-ПРОЕКТ</span><h1>{projectName}</h1><p>{projectType}</p><button className="project-menu-edit-brief" onClick={()=>setBrief(true)}>✎ Редактировать бриф</button></div>
    <ol className="project-menu-stages">{stages.filter(stage=>!stage.parentId||substepsOpen).map(stage=><li key={stage.id} className={`${selected===stage.id?'is-active ':''}${stage.path?'is-available':'is-placeholder'}${stage.parentId?' is-substage':''}${hasPlanningSubstages&&stage.id==='planning'?' has-substage-toggle':''}${hasPlanningSubstages&&stage.id==='planning'&&selected.startsWith('planning-')?' has-active-substage':''}`}><button type="button" aria-current={selected===stage.id?'step':undefined} aria-controls={`workspace-${stage.id}`} onClick={()=>select(stage.id)}>{!stage.parentId&&<span>{String(baseStages.findIndex(item=>item.id===stage.id)+1).padStart(2,'0')}</span>}<b>{stage.label}</b>{!stage.path&&<small>скоро</small>}</button>{hasPlanningSubstages&&stage.id==='planning'&&<button type="button" className="project-substage-toggle" aria-label={substepsOpen?'Свернуть подэтапы':'Раскрыть подэтапы'} aria-expanded={substepsOpen} onClick={()=>setSubstepsOpen(open=>!open)}><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg></button>}</li>)}</ol>
    <button className="project-menu-back" onClick={onProjects}>← Все проекты</button>
   </aside>
   <section className="project-stage-main" aria-label={`Рабочая область: ${active.label}`}>
    {stages.filter(stage=>opened.includes(stage.id)).map(stage=><div id={`workspace-${stage.id}`} className="project-stage-pane" key={stage.id} hidden={selected!==stage.id}>
     {stage.path?<>{!loaded.includes(stage.id)&&<div className="project-stage-loading" role="status">Открываем «{stage.label}»…</div>}<iframe ref={frame=>{if(frame)frames.current.set(stage.id,frame);else frames.current.delete(stage.id);}} allowFullScreen title={`${stage.label} — рабочая область`} src={frameUrl(stage)} onLoad={()=>setLoaded(current=>current.includes(stage.id)?current:[...current,stage.id])}/></>:<div className="project-stage-coming"><span>СЛЕДУЮЩИЙ ЭТАП</span><h2>{stage.label}</h2><p>Рабочая область скоро будет доступна.</p></div>}
    </div>)}
   </section>
  </div>
  {brief&&<ProjectBriefEditor projectId={projectId} onClose={()=>setBrief(false)} onSaved={onBriefSaved}/>}
 </main>;
}
