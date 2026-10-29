'use client';
import {useEffect,useRef,useState} from 'react';
import {bounds,issues,type MeasureDoc} from '@/lib/measured-plan/measure-model';
import {doorSymbol} from '@/lib/measured-plan/measure-editing';
import {wallBodies,wallJoins} from '@/lib/measured-plan/measure-display';
import {wallNumberMarks} from '@/lib/measured-plan/wall-number-layout';
import {planDrawingDimensions,openingWidthMarks} from '@/lib/measured-plan/measure-annotations';
import {MeasureColumns} from './editor/measure-columns';

export function MeasuredPlanThumbnail({doc}:{doc:MeasureDoc}){
 const box=bounds(doc),font=Math.max(box.width,box.height)/75,marks=wallNumberMarks(doc,font),bodies=wallBodies(doc.walls),pad=font*4;
 const minX=Math.min(box.x,...marks.map(m=>m.box.left))-pad,minY=Math.min(box.z,...marks.map(m=>m.box.top))-pad,maxX=Math.max(box.x+box.width,...marks.map(m=>m.box.right))+pad,maxY=Math.max(box.z+box.height,...marks.map(m=>m.box.bottom))+pad;
 return <svg viewBox={[minX,minY,maxX-minX,maxY-minY].join(' ')} role="img" aria-label="Сохранённый обмерный план" style={{width:'100%',height:'100%',display:'block'}}>
  <rect x={minX} y={minY} width={maxX-minX} height={maxY-minY} fill="#fffdfa"/>
  {bodies.map(w=><line key={w.id} x1={w.a[0]} y1={w.a[1]} x2={w.b[0]} y2={w.b[1]} stroke="#302b27" strokeWidth={Math.max(30,w.thickness)}/>)}
  {wallJoins(bodies).map((j,i)=><polygon key={i} points={j.polygon.map(p=>p.join(',')).join(' ')} fill="#302b27"/>)}
  {doc.openings.map(o=>{const w=doc.walls.find(w=>w.id===o.wallId);if(!w)return null;const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])||1,ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l,a=[w.a[0]+ux*(o.offset-o.width/2),w.a[1]+uy*(o.offset-o.width/2)],b=[a[0]+ux*o.width,a[1]+uy*o.width],s=doorSymbol(w,o);return <g key={o.id}><line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fffdfa" strokeWidth={w.thickness+25}/>{o.kind==='door'?<><path d={s.path} fill="none" stroke="#302b27" strokeWidth={font*.1}/><line x1={s.hinge[0]} y1={s.hinge[1]} x2={s.leaf[0]} y2={s.leaf[1]} stroke="#302b27" strokeWidth={font*.15}/></>:<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#302b27" strokeWidth={font*.1} strokeDasharray={o.kind==='opening'?`${font*.3} ${font*.2}`:undefined}/>}</g>;})}
  {[...planDrawingDimensions(doc),...openingWidthMarks(doc,font).map(m=>({a:m.da,b:m.db,value:Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1])}))].map((d,i)=>{const x=(d.a[0]+d.b[0])/2,y=(d.a[1]+d.b[1])/2;return <g key={i}><line x1={d.a[0]} y1={d.a[1]} x2={d.b[0]} y2={d.b[1]} stroke="#302b27" strokeWidth={font*.05} strokeDasharray={`${font*.2} ${font*.2}`}/><text x={x+font*.3} y={y-font*.3} fontSize={font*.7} fill="#302b27" stroke="#fffdfa" strokeWidth={font*.15} paintOrder="stroke">{Math.round(d.value)}</text></g>;})}
  {marks.filter(m=>!m.id.startsWith('wall_gap_')).map(m=><g key={m.id}><rect x={m.box.left} y={m.box.top} width={m.halfWidth*2} height={m.halfHeight*2} fill="#fffdfa" stroke="#b7afa5" strokeWidth={font*.05}/><text x={m.x} y={m.y+m.fontSize*.32} textAnchor="middle" fontSize={m.fontSize} fill="#302b27">{m.number}</text></g>)}
  {(doc.furniture||[]).map(f=><g key={f.id} transform={`translate(${f.position.join(' ')}) rotate(${f.rotation})`}><rect x={-f.width/2} y={-f.depth/2} width={f.width} height={f.depth} fill="#eee8dd" stroke="#65574a" strokeWidth={font*.12}/><text textAnchor="middle" fontSize={font*.7} fill="#302b27">{f.name}</text></g>)}
  <MeasureColumns columns={doc.columns} font={font} monochrome/>
 </svg>;
}

export default function MeasuredStagePreview({projectId,onContinue,nextLabel,onNext}:{projectId:string;onContinue:()=>void;nextLabel:string;onNext:()=>void}){
 const [doc,setDoc]=useState<MeasureDoc|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [expanded,setExpanded]=useState<'source'|'plan'|null>(null),viewer=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(!expanded)return;const dialog=viewer.current;if(!dialog)return;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();return()=>{dialog.close();document.body.style.overflow=previousOverflow;};},[expanded]);
 useEffect(()=>setExpanded(null),[projectId]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setDoc(null);setError('');fetch('/api/projects/'+encodeURIComponent(projectId)+'/measured-plan',{cache:'no-store',signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Не удалось загрузить обмерный план');return data.document as MeasureDoc|null;}).then(setDoc).catch(e=>{if(e.name!=='AbortError')setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[projectId]);
 const missing=doc?issues(doc).length:0,wallCount=doc?.walls.filter(w=>!w.id.startsWith('wall_gap_')).length||0;
 return <>
  <div className="project-menu-title-row"><div><span>РАЗДЕЛ ПРОЕКТА</span><h2>Обмерный план</h2><p>Исходный чертёж и сохранённый результат обмеров — перед продолжением работы.</p></div><mark>{loading?'Загрузка…':error?'Не удалось загрузить':doc?'Сохранено':'Можно начать'}</mark></div>
  {error?<div role="alert" className="measured-stage-error">{error}<button onClick={()=>location.reload()}>Повторить загрузку</button></div>:loading?<p role="status">Загружаем исходник и обмерный план…</p>:<><div className="project-menu-workspace">
   <article className="project-menu-feature measured-stage-feature"><div className="measured-stage-comparison">
    <figure><figcaption>Исходный файл</figcaption><div>{doc?<button className="measured-stage-expand" aria-label="Увеличить исходный файл" onClick={()=>setExpanded('source')}><img src={doc.source.image} alt="Исходный загруженный план"/></button>:<p>План ещё не загружен</p>}</div>{doc&&<small>{doc.source.name} · страница {doc.source.page} из {doc.source.pages}</small>}</figure>
    <figure><figcaption>Обмерный план · результат</figcaption><div>{doc&&doc.walls.length?<button className="measured-stage-expand" aria-label="Увеличить обмерный план" onClick={()=>setExpanded('plan')}><MeasuredPlanThumbnail doc={doc}/></button>:<p>Здесь появится результат после построения плана</p>}</div><small>{doc?'Последняя сохранённая версия проекта':'Создайте план в редакторе'}</small></figure>
   </div><div className="project-menu-feature-copy"><div><span>ОБМЕРЫ И РАЗМЕРЫ</span><h3>{doc?'Продолжить обмерный план':'Создать обмерный план'}</h3><p>{doc?'Уточняйте размеры, редактируйте стены и проёмы.':'Загрузите JPEG, PNG или PDF и начните работу.'}</p></div><button onClick={onContinue}>{doc?'Продолжить работу':'Начать работу'} <b>→</b></button></div></article>
   <aside className="project-menu-details"><section><span>СОСТАВ РАЗДЕЛА</span><p><b>Исходный файл</b><em>{doc?'загружен':'не загружен'}</em></p><p><b>Стены</b><em>{wallCount}</em></p><p><b>Окна и проёмы</b><em>{doc?.openings.length||0}</em></p><p><b>Общая высота стен</b><em>{doc?.height?doc.height+' мм':'не указана'}</em></p><p><b>Проверка размеров</b><em>{doc?missing?'уточнить: '+missing:'параметры заполнены':'план не создан'}</em></p>{doc&&<small>Размеры по рисунку требуют проверки фактическими обмерами.</small>}</section><section className="project-menu-next"><span>СЛЕДУЮЩИЙ РАЗДЕЛ</span><h3>{nextLabel}</h3><p>Продолжите работу над проектом на следующем этапе.</p><button onClick={onNext}>Перейти <b>→</b></button></section></aside>
  </div><section className="project-menu-materials"><div><span>МАТЕРИАЛЫ ПРОЕКТА</span><h3>Исходник и результат</h3></div><p><b>{doc?1:0}</b> исходный файл</p><p><b>{doc?.walls.length?1:0}</b> обмерный план</p><p><b>{doc?.dimensions?.length||0}</b> дополнительных размеров</p></section></>}
  <dialog ref={viewer} className="measured-stage-viewer" aria-label={expanded==='source'?'Исходный файл — быстрый просмотр':'Обмерный план — быстрый просмотр'} onCancel={e=>{e.preventDefault();setExpanded(null);}} onClick={()=>setExpanded(null)}>
   <button className="measured-stage-viewer-close" aria-label="Закрыть быстрый просмотр" onClick={()=>setExpanded(null)}>Закрыть ×</button>
   <span className="measured-stage-viewer-hint">Повторный клик или Esc — вернуться</span>
   {doc&&(expanded==='source'?<img src={doc.source.image} alt="Исходный загруженный план"/>:expanded==='plan'?<MeasuredPlanThumbnail doc={doc}/>:null)}
  </dialog>
 </>;
}
