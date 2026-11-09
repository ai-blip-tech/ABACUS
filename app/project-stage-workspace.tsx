'use client';
import {useEffect,useState} from 'react';
import AccountDropdown from './account-dropdown';
import ProjectBriefEditor,{type BriefProject} from './project-brief-editor';
import './project-stage-workspace.css';

type User={id:string;email:string;firstName:string;lastName:string;role:'user'|'admin';phone:string;companyRole:string};
const stages=[
 {id:'sources',label:'Обмерный план',path:'/measured-plan'},
 {id:'installation',label:'Монтаж, демонтаж',path:'/partition-plan'},
 {id:'planning',label:'Планировочное решение',path:'/planning-plan'},
 {id:'materials',label:'Концепция и материалы',path:'/materials-concept'},
 {id:'interior',label:'Интерьер и меблировка',path:'/'},
 {id:'lighting',label:'Технический свет',path:'/technical-lighting'},
 {id:'bathroom',label:'Санузел',path:null},
 {id:'porcelain',label:'Керамогранит',path:null},
 {id:'documentation',label:'Документация',path:null},
];
export default function ProjectStageWorkspace({user,projectId,projectName,projectType,onHome,onProjects,onBriefSaved}:{user:User|null;projectId:string;projectName:string;projectType:string;onHome:()=>void;onProjects:()=>void;onBriefSaved:(project:BriefProject)=>void}){
 const [selected,setSelected]=useState('sources');
 const [opened,setOpened]=useState<string[]>([]);
 const [loaded,setLoaded]=useState<string[]>([]);
 const [brief,setBrief]=useState(false);
 const select=(id:string,push=true)=>{
  if(!stages.some(stage=>stage.id===id))return;
  setSelected(id);setOpened(current=>current.includes(id)?current:[...current,id]);
  const url=new URL(location.href);url.searchParams.set('stage',id);url.hash='меню-проекта';
  if(push)history.pushState({projectId,norrView:'projectMenu'},'',url);
  try{localStorage.setItem(`roomdesign:last-stage:${projectId}`,id);}catch{/* Navigation still works without local storage. */}
 };
 useEffect(()=>{
  const restore=()=>{let saved='sources';try{saved=localStorage.getItem(`roomdesign:last-stage:${projectId}`)||saved;}catch{}
   const requested=new URLSearchParams(location.search).get('stage')||saved;
   select(stages.some(stage=>stage.id===requested)?requested:'sources',false);};
  restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
 },[projectId]);
 const active=stages.find(stage=>stage.id===selected)!;
 const frameUrl=(stage:typeof stages[number])=>{
  const url=new URL(stage.path!,location.origin);url.searchParams.set('project',projectId);url.searchParams.set('embeddedStage','1');
  if(stage.id==='interior'){url.searchParams.set('studioPreview','unified');url.searchParams.set('studioMode','image');url.hash='студия';}
  return url.pathname+url.search+url.hash;
 };
 return <main className={`project-menu-preview project-stage-workspace${active.path?' has-workspace':''}`}>
  <header className="project-menu-header">
   <button className="project-menu-wordmark room-design-wordmark" type="button" onClick={onHome}>ROOM DESIGN</button>
   <nav aria-label="Путь проекта"><button onClick={onProjects}>Проекты</button><span>›</span><b>{projectName}</b><span>›</span><em>{active.label}</em></nav>
   <div className="project-menu-account">{user&&<AccountDropdown user={user} dashboard/>}</div>
  </header>
  <div className="project-stage-layout">
   <aside className="project-menu-sidebar" aria-label="Этапы проекта">
    <div className="project-menu-summary"><span>ДИЗАЙН-ПРОЕКТ</span><h1>{projectName}</h1><p>{projectType}</p><button className="project-menu-edit-brief" onClick={()=>setBrief(true)}>✎ Редактировать бриф</button></div>
    <ol className="project-menu-stages">{stages.map((stage,index)=><li key={stage.id} className={`${selected===stage.id?'is-active ':''}${stage.path?'is-available':'is-placeholder'}`}><button type="button" aria-current={selected===stage.id?'step':undefined} aria-controls={`workspace-${stage.id}`} onClick={()=>select(stage.id)}><span>{String(index+1).padStart(2,'0')}</span><b>{stage.label}</b>{!stage.path&&<small>скоро</small>}</button></li>)}</ol>
    <button className="project-menu-back" onClick={onProjects}>← Все проекты</button>
   </aside>
   <section className="project-stage-main" aria-label={`Рабочая область: ${active.label}`}>
    {stages.filter(stage=>opened.includes(stage.id)).map(stage=><div id={`workspace-${stage.id}`} className="project-stage-pane" key={stage.id} hidden={selected!==stage.id}>
     {stage.path?<>{!loaded.includes(stage.id)&&<div className="project-stage-loading" role="status">Открываем «{stage.label}»…</div>}<iframe allowFullScreen title={`${stage.label} — рабочая область`} src={frameUrl(stage)} onLoad={()=>setLoaded(current=>current.includes(stage.id)?current:[...current,stage.id])}/></>:<div className="project-stage-coming"><span>СЛЕДУЮЩИЙ ЭТАП</span><h2>{stage.label}</h2><p>Рабочая область скоро будет доступна.</p></div>}
    </div>)}
   </section>
  </div>
  {brief&&<ProjectBriefEditor projectId={projectId} onClose={()=>setBrief(false)} onSaved={onBriefSaved}/>}
 </main>;
}
