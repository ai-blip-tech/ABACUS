'use client';
import {useEffect,useState} from 'react';
import {MeasuredPlanThumbnail} from '../measured-plan/stage-preview';
import type {PlanningAlbum} from '@/lib/planning-plan/variants';
import type {MeasureDoc} from '@/lib/measured-plan/measure-model';
export default function PlanningStagePreview({projectId,onContinue,nextLabel,onNext}:{projectId:string;onContinue:()=>void;nextLabel:string;onNext:()=>void}){
 const[doc,setDoc]=useState<PlanningAlbum|null>(null),[base,setBase]=useState<MeasureDoc|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{const c=new AbortController();fetch(`/api/projects/${projectId}/planning-plan`,{cache:'no-store',signal:c.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);if(!c.signal.aborted){setDoc(d.document);setBase(d.bases?.measured?.plan||null);}}).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[projectId]);
 const plan=doc?.variants.manual?.plan||base;
 return <>
  <div className="project-menu-title-row"><div><span>РАЗДЕЛ ПРОЕКТА · 03</span><h2>Планировочное решение</h2><p>Редактируемая планировка, стены, проёмы, мебель и оборудование.</p></div><mark>{loading?'Загрузка…':doc?'Сохранено':base?'Обмерная основа':'Пустой проект'}</mark></div>
  {error?<p role="alert">{error}</p>:<div className="project-menu-workspace"><article className="project-menu-feature">
   <div className="measured-stage-comparison"><figure><figcaption>Планировочное решение</figcaption><div>{plan?<MeasuredPlanThumbnail doc={plan}/>:<p>Обмерного плана нет. Откроется пустая сетка для самостоятельного построения.</p>}</div></figure><figure><figcaption>Мебель и оборудование</figcaption><div><p>{plan?.furniture?.length||0} предметов · редактируемый вид сверху</p></div></figure></div>
   <div className="project-menu-feature-copy"><div><span>РАБОЧАЯ ПЛАНИРОВКА</span><h3>{doc?'Продолжить работу':'Начать планировочное решение'}</h3><p>Обмерная основа переносится автоматически. Доступны импорт DWG/DXF и самостоятельное построение, по три независимых листа в каждом режиме. Предыдущие этапы остаются без изменений.</p></div><button disabled={loading} onClick={onContinue}>{doc?'Продолжить работу':'Открыть этап'} <b>→</b></button></div>
  </article><aside className="project-menu-details"><section><span>СОСТАВ РАЗДЕЛА</span><p><b>Стены и перегородки</b><em>{plan?.walls.length||0}</em></p><p><b>Мебель</b><em>{plan?.furniture?.length||0}</em></p><p><b>Основа</b><em>{doc?({installation:'Сохранённая рабочая копия',measured:'Обмерный план',manual:'Ручное построение'})[doc.source.kind]:base?'Обмерный план':'Пустая сетка'}</em></p></section><section className="project-menu-next"><span>СЛЕДУЮЩИЙ РАЗДЕЛ</span><h3>{nextLabel}</h3><button onClick={onNext}>Перейти <b>→</b></button></section></aside></div>}
 </>;
}
