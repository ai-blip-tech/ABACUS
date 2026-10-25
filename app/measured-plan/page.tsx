'use client';
import React,{useEffect,useRef,useState} from 'react';
import EditorHeader from '../editor-header';
import MeasureApp from './editor/measure-app';
import type {MeasureDoc} from '@/lib/measured-plan/measure-model';

type User={email:string;firstName:string;lastName:string;role:'user'|'admin'};
export default function MeasuredPlanPage(){
 const [user,setUser]=useState<User|null>(null),[project,setProject]=useState<{id:string,name:string}|null>(null),[doc,setDoc]=useState<MeasureDoc|null>(null),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
 const revision=useRef(0),queue=useRef<Promise<unknown>>(Promise.resolve()),conflicted=useRef(false);
 useEffect(()=>{const id=new URLSearchParams(location.search).get('project');let alive=true;async function load(){try{const auth=await fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.json());if(!alive)return;setUser(auth.user||null);if(!auth.user)throw Error('Войдите в Room Design, чтобы открыть обмерный план');if(!id)throw Error('Выберите проект в разделе «Мои проекты»');const r=await fetch('/api/projects/'+encodeURIComponent(id)+'/measured-plan',{cache:'no-store'}),data=await r.json();if(!r.ok)throw Error(data.error);if(!alive)return;setProject(data.project);setDoc(data.document);revision.current=data.revision;setLoaded(true);}catch(e){if(alive)setError(e instanceof Error?e.message:'Не удалось загрузить проект');}}void load();return()=>{alive=false;};},[]);
 const home=()=>location.assign('/'),menu=()=>location.assign(project?'/?project='+encodeURIComponent(project.id)+'&stage=sources#меню-проекта':'/#кабинет'),login=()=>location.assign('/#кабинет');
 const header=<EditorHeader user={user} projectName={project?.name||'Обмерный план'} sectionName="Обмерный план" onHome={home} onProjectMenu={menu} onLogin={login}/>;
 function save(document:MeasureDoc){
  const task=queue.current.catch(()=>{}).then(async()=>{if(conflicted.current)throw Error('План изменён в другой вкладке. Обновите страницу; текущие изменения не перезаписаны.');const r=await fetch('/api/projects/'+encodeURIComponent(project!.id)+'/measured-plan',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:revision.current,document})});const data=await r.json();if(r.status===409)conflicted.current=true;if(!r.ok)throw Error(data.error||'Не удалось сохранить обмерный план');revision.current=data.revision;});queue.current=task;return task;
 }
 if(!loaded)return <main>{header}<section style={{padding:32}} role={error?'alert':'status'}><h1>{error||'Загружаем обмерный план…'}</h1>{error&&<a href="/#кабинет">Перейти к проектам / войти</a>}</section></main>;
 return <MeasureApp initialDoc={doc} projectId={project!.id} projectName={project!.name} header={header} onSave={save}/>;
}
