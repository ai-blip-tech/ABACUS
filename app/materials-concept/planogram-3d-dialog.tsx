'use client';

import {useEffect,useRef,type CSSProperties,type RefObject} from 'react';
import {MeasuredPlanThumbnail} from '../measured-plan/stage-preview';
import type {MeasureDoc} from '@/lib/measured-plan/measure-model';
import type {MaterialNode} from '@/lib/material-board/model';
import type {Planogram3DValues} from '@/lib/material-board/generation';

const choices:{key:keyof Planogram3DValues;label:string;options:string[]}[]=[
 {key:'style',label:'Стиль',options:['Современный','Минимализм','Скандинавский','Джапанди','Неоклассика','Современная классика','Лофт','Индустриальный','Ар-деко','Mid-century modern','Эко','Средиземноморский','Прованс','Премиальный','Использовать стиль референсов']},
 {key:'furnishing',label:'Количество мебели',options:['Минимально','Умеренно','Подробно']},
 {key:'existingFurniture',label:'Существующая мебель на плане',options:['Сохранить расположение','Использовать как подсказку','Заменить новой мебелью']},
 {key:'lighting',label:'Тип освещения',options:['Естественное','Искусственное','Смешанное']},
 {key:'atmosphere',label:'Время и атмосфера',options:['Яркий день','Мягкий дневной свет','Золотой час','Вечер','Ночь']},
 {key:'peopleCount',label:'Количество людей',options:['Без людей','Один человек','2–3 человека','4–6 человек','Много людей','Указать в запросе']},
 {key:'peopleBehavior',label:'Поведение людей',options:['Автоматически','Стоят','Сидят','Отдыхают','Общаются','Работают','Принимают пищу','Смешанные действия','Описать в запросе']},
 {key:'detail',label:'Детализация',options:['Стандартная','Высокая','Максимальная']},
 {key:'wallMode',label:'Толщина и высота стен',options:['Определить автоматически','Использовать размеры чертежа','Указать вручную']},
 {key:'environment',label:'Окружение',options:['Без окружения','Нейтральный фон','Ландшафт','Городское окружение']},
 {key:'resultFormat',label:'Формат результата',options:['Как исходник','Квадратный','Горизонтальный','Вертикальный']},
];

function Preview({node}:{node:MaterialNode}){return node.image?<img src={node.image} alt=""/>:<span className={'concept-surface '+(node.pattern||'')} style={{'--sample':node.colour||'#d5cab6'} as CSSProperties}/>;}

export default function Planogram3DDialog({planDoc,planImage,planName,planOrigin,sourceRef,references,selectedIds,values,busy,error,onSelectedIds,onValues,onUploadPlan,onRestorePlan,onClose,onGenerate}:{planDoc:MeasureDoc|null;planImage:string;planName:string;planOrigin:string;sourceRef:RefObject<HTMLDivElement|null>;references:MaterialNode[];selectedIds:string[];values:Planogram3DValues;busy:boolean;error:string;onSelectedIds:(ids:string[])=>void;onValues:(values:Planogram3DValues)=>void;onUploadPlan:()=>void;onRestorePlan:()=>void;onClose:()=>void;onGenerate:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{const current=dialog.current;current?.showModal();return()=>current?.close();},[]);
 const selected=selectedIds.map(id=>references.find(n=>n.id===id)).filter((n):n is MaterialNode=>Boolean(n)),available=references.filter(n=>!selectedIds.includes(n.id));
 const update=<K extends keyof Planogram3DValues>(key:K,value:Planogram3DValues[K])=>onValues({...values,[key]:value});
 return <dialog ref={dialog} className="concept-modal concept-planogram-modal" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}>
  <header><div><small>ШАБЛОН · ПЛАНОГРАММА 3D</small><h2>Создать объёмный план</h2></div><button className="concept-planogram-close" aria-label="Закрыть" disabled={busy} onClick={onClose}>×</button></header>
  <div className="concept-planogram-flow">
   <section className="concept-planogram-source"><div className="concept-planogram-step"><i>1</i><span><b>Планировочное решение</b><small>Архитектура будет заблокирована</small></span></div><div ref={sourceRef} className="concept-planogram-source-preview">{planImage?<img src={planImage} alt={planName}/>:planDoc?<MeasuredPlanThumbnail doc={planDoc}/>:<p>Планировка не найдена</p>}<mark>{planOrigin}</mark></div><div className="concept-planogram-source-meta"><span><b>{planName}</b><small>{planImage?'Загруженный файл':'Сохранённая редактируемая планировка проекта'}</small></span><button onClick={onUploadPlan} disabled={busy}>Загрузить свою</button>{planImage&&<button onClick={onRestorePlan} disabled={busy}>Вернуть из проекта</button>}</div><p>В будущем сохранённое «Планировочное решение» проекта подставляется сюда автоматически. Загрузка своей планировки меняет только этот запуск.</p></section>
   <section className="concept-planogram-references"><div className="concept-planogram-step"><i>2</i><span><b>Проверьте референсы</b><small>Связанные материалы выбраны автоматически · до 10</small></span><strong>{selectedIds.length}<em>/10</em></strong></div><div className="concept-planogram-selected">{selected.map((node,index)=><article key={node.id}><Preview node={node}/><span><b>{node.title}</b><small>Reference {index+1}</small></span><button aria-label={'Убрать '+node.title} disabled={busy} onClick={()=>onSelectedIds(selectedIds.filter(id=>id!==node.id))}>×</button></article>)}{!selected.length&&<p>Можно создать планограмму без референсов — стиль будет задан ответами ниже.</p>}</div>{available.length>0&&<details><summary>Добавить материалы со стола <span>{available.length}</span></summary><div className="concept-planogram-available">{available.map(node=><button key={node.id} disabled={busy||selectedIds.length>=10} onClick={()=>onSelectedIds([...selectedIds,node.id])}><Preview node={node}/><span>{node.title}</span><b>+</b></button>)}</div></details>}</section>
   <section className="concept-planogram-brief"><div className="concept-planogram-step"><i>3</i><span><b>Параметры будущего интерьера</b><small>Вопросы из действующего шаблона Room Design</small></span></div><label className="concept-planogram-description">Опишите будущий интерьер<textarea value={values.designBrief} maxLength={2500} placeholder="Стиль, материалы, мебель, свет и сценарии жизни. Архитектура плана останется неизменной." onChange={e=>update('designBrief',e.target.value)}/></label><div className="concept-planogram-fields">{choices.filter(item=>item.key!=='peopleBehavior'||values.peopleCount!=='Без людей').map(item=><label key={item.key}>{item.label}<select value={values[item.key]} onChange={e=>update(item.key,e.target.value)}>{item.options.map(option=><option key={option}>{option}</option>)}</select></label>)}</div>{values.wallMode==='Указать вручную'&&<label className="concept-planogram-description">Размеры стен<input value={values.wallDimensions} placeholder="Высота 2,8 м; внешние стены 300 мм; перегородки 120 мм" onChange={e=>update('wallDimensions',e.target.value)}/></label>}</section>
  </div>
  {error&&<p className="concept-moodboard-error" role="alert">{error}</p>}
  <footer className="concept-planogram-actions"><p><b>Floor Plan Lock</b> · контур, помещения, стены, окна и двери исходного плана не изменяются.</p><button className="concept-moodboard-secondary" disabled={busy} onClick={onClose}>Отмена</button><button className="concept-moodboard-generate" disabled={busy||(!planImage&&!planDoc)} onClick={onGenerate}>{busy?<><span className="concept-moodboard-loader"/>Строим планограмму…</>:'Создать 3D-план'}</button></footer>
 </dialog>;
}
