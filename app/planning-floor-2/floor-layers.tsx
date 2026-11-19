'use client';
import {useEffect,useRef,useState} from 'react';

type FloorLayers={roomNames:boolean;roomAreas:boolean;grid:boolean};
const defaults:FloorLayers={roomNames:true,roomAreas:true,grid:true};
const labels:Record<keyof FloorLayers,string>={roomNames:'Названия помещений',roomAreas:'Площади помещений',grid:'Сетка'};

export function useFloorLayers(planId:string){
 const [value,setValue]=useState<FloorLayers>(defaults),[loadedKey,setLoadedKey]=useState('');
 const key='roomdesign:floor-layers:'+planId;
 useEffect(()=>{let next={...defaults};try{const stored=JSON.parse(localStorage.getItem(key)||'null');for(const name of Object.keys(defaults) as (keyof FloorLayers)[])if(typeof stored?.[name]==='boolean')next[name]=stored[name];}catch{}setValue(next);setLoadedKey(key);},[key]);
 useEffect(()=>{if(loadedKey===key)try{localStorage.setItem(key,JSON.stringify(value));}catch{}},[key,loadedKey,value]);
 return [value,setValue] as const;
}

export function FloorLayersMenu({value,onChange}:{value:FloorLayers;onChange:(value:FloorLayers)=>void}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('pointerdown',close);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',close);window.removeEventListener('keydown',key);};},[open]);
 return <div className="floor2-layers" ref={root}>
  <button className="floor2-layers-trigger" aria-label="Слои плана" title="Слои плана" aria-expanded={open} onClick={()=>setOpen(v=>!v)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></svg></button>
  {open&&<section className="floor2-layers-popover" aria-label="Видимость слоёв"><header><b>Слои плана</b><button aria-label="Закрыть слои" onClick={()=>setOpen(false)}>×</button></header>
   {(Object.keys(labels) as (keyof FloorLayers)[]).map(name=><label key={name}><input type="checkbox" checked={value[name]} onChange={e=>onChange({...value,[name]:e.target.checked})}/><span>{labels[name]}</span></label>)}
   <button className="floor2-layers-reset" onClick={()=>onChange({...defaults})}>Показать всё</button>
  </section>}
 </div>;
}
