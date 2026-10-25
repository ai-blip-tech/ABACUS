'use client';
import {useEffect,useRef,useState} from 'react';
import {BRIEF_FIELDS,readBrief,writeBrief,type BriefDraft} from '@/lib/project-brief';

export type BriefProject = {name:string;project_type:string;description:string|null;updated_at:string};
export default function ProjectBriefEditor({projectId,onClose,onSaved}:{projectId:string;onClose:()=>void;onSaved:(project:BriefProject)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[project,setProject]=useState<BriefProject|null>(null),[draft,setDraft]=useState<BriefDraft>(readBrief('')),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState('');
 useEffect(()=>{const d=dialog.current!;d.showModal();const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{d.close();document.body.style.overflow=overflow;};},[]);
 useEffect(()=>{const controller=new AbortController();fetch(`/api/projects/${encodeURIComponent(projectId)}`,{cache:'no-store',signal:controller.signal}).then(async r=>{const p=await r.json();if(!r.ok)throw Error(p.error||'Не удалось загрузить бриф');setProject(p.project);setDraft(readBrief(p.project.description||''));}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[projectId]);
 const description=writeBrief(draft);
 async function save(e:React.FormEvent){e.preventDefault();if(!project||saving)return;setError('');if(!project.name.trim()){setError('Введите название проекта.');return;}if(description.length>1000){setError('Сократите бриф до 1000 символов. Изменения не сохранены.');return;}setSaving(true);try{const r=await fetch(`/api/projects/${encodeURIComponent(projectId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:project.name.trim(),projectType:project.project_type,description,expectedUpdatedAt:project.updated_at})});const p=await r.json();if(!r.ok)throw Error(p.error||'Не удалось сохранить бриф');onSaved(p.project);onClose();}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить бриф');}finally{setSaving(false);}}
 return <dialog ref={dialog} className="project-brief-dialog" aria-labelledby="edit-brief-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}}>
  <form onSubmit={save} noValidate><header><div><span>ДИЗАЙН-ПРОЕКТ</span><h2 id="edit-brief-title">Редактировать бриф</h2><p>Уточните задачи и пожелания. Остальные материалы проекта сохранятся.</p></div><button type="button" aria-label="Закрыть редактирование брифа" disabled={saving} onClick={onClose}>×</button></header>
   {loading?<p role="status">Загружаем бриф…</p>:project&&<fieldset disabled={saving}><div className="project-brief-edit-grid">
    <label>Название проекта<input value={project.name} maxLength={120} onChange={e=>setProject({...project,name:e.target.value})}/></label>
    <label>Тип объекта<select value={project.project_type} onChange={e=>setProject({...project,project_type:e.target.value})}>{[...new Set(['Квартира','Дом','Офис','Гостеприимство','Другое',project.project_type])].map(t=><option key={t}>{t}</option>)}</select></label>
    {BRIEF_FIELDS.map(([key,label])=><label key={key}>{label}<textarea value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
    <label className="project-brief-other">Дополнительное описание<textarea value={draft.other} onChange={e=>setDraft({...draft,other:e.target.value})}/></label>
   </div><small className={description.length>1000?'is-over-limit':''}>{description.length} / 1000 символов в брифе</small></fieldset>}
   {error&&<p role="alert" className="project-brief-edit-error">{error}</p>}
   <footer><button type="button" disabled={saving} onClick={onClose}>Отмена</button><button type="submit" disabled={loading||saving||!project}>{saving?'Сохраняем…':'Сохранить изменения'}</button></footer>
  </form>
 </dialog>;
}
