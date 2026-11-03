'use client';
import {useEffect,useRef,useState} from 'react';

export type MeasureLayers={floors:boolean;walls:boolean;columns:boolean;openings:boolean;furniture:boolean;wallNumbers:boolean;roomNames:boolean;roomAreas:boolean;dimensions:boolean;guides:boolean;source:boolean;grid:boolean};
export const defaultMeasureLayers=(planning:boolean):MeasureLayers=>({floors:true,walls:true,columns:true,openings:true,furniture:planning,wallNumbers:true,roomNames:true,roomAreas:true,dimensions:true,guides:true,source:!planning,grid:true});
const labels:Record<keyof MeasureLayers,string>={floors:'Покрытия пола',walls:'Стены',columns:'Колонны',openings:'Окна и двери',furniture:'Мебель',wallNumbers:'Номера стен',roomNames:'Названия помещений',roomAreas:'Площади помещений',dimensions:'Размеры',guides:'Направляющие',source:'Исходная подложка',grid:'Сетка'};

export function MeasureLayersMenu({value,onChange,planning=false}:{value:MeasureLayers;onChange:(next:MeasureLayers)=>void;planning?:boolean}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};window.addEventListener('pointerdown',close);return()=>window.removeEventListener('pointerdown',close);},[open]);
 return <div className="measure-layers-menu" ref={root}>
  <button className="partition-tool-icon measure-layers-trigger" aria-label="Слои плана" aria-expanded={open} title="Слои плана" onClick={()=>setOpen(v=>!v)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg></button>
  {open&&<section className="measure-layers-popover" aria-label="Видимость слоёв"><header><div><b>Слои плана</b><small>Скрытие не удаляет объекты</small></div><button aria-label="Закрыть слои" onClick={()=>setOpen(false)}>×</button></header>
   {(Object.keys(labels) as (keyof MeasureLayers)[]).filter(key=>planning||key!=='furniture').map(key=><label key={key}><input type="checkbox" checked={value[key]} onChange={event=>onChange({...value,[key]:event.target.checked})}/><span>{labels[key]}</span></label>)}
   <button className="layers-reset" onClick={()=>onChange(defaultMeasureLayers(planning))}>Показать всё</button>
  </section>}
 </div>;
}
