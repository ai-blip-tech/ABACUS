'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {parquetLayouts,type FloorRegion} from '@/lib/measured-plan/measure-floor-finishes';
import {ParquetSwatch} from './measure-parquet-pattern';
import './measure-floor.css';

export function FloorFinishMenu({region,area,at,onChange,onClose,onDelete}:{region:FloorRegion;area:number;at:{x:number;y:number};onChange:(patch:Partial<Pick<FloorRegion,'layout'|'wood'>>)=>void;onClose:()=>void;onDelete:()=>void}){
 const [parquet,setParquet]=useState(!!region.layout),root=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState(at);
 useLayoutEffect(()=>{const place=()=>{const bounds=root.current?.getBoundingClientRect();if(bounds)setPosition({x:Math.max(12,Math.min(at.x,window.innerWidth-bounds.width-12)),y:Math.max(12,Math.min(at.y,window.innerHeight-bounds.height-12))});};place();window.addEventListener('resize',place);return()=>window.removeEventListener('resize',place);},[at.x,at.y,parquet]);
 useEffect(()=>{const down=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))onClose();};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();onClose();}};window.addEventListener('pointerdown',down);window.addEventListener('keydown',key);return()=>{window.removeEventListener('pointerdown',down);window.removeEventListener('keydown',key);};},[onClose]);
 return <div ref={root} className="floor-finish-menu" data-floor-menu role="dialog" aria-label="Покрытие участка пола" style={{left:position.x,top:position.y}} onPointerDown={event=>event.stopPropagation()}>
  <header><div><b>{parquet?'Паркет':'Участок пола'}</b><small>{area.toFixed(2)} м²</small></div><button type="button" aria-label="Закрыть выбор пола" onClick={onClose}>×</button></header>
  {!parquet?<button className="floor-material-entry" onClick={()=>setParquet(true)}><ParquetSwatch layout="straight" wood={region.wood}/><span>Паркет</span><span>›</span></button>:<>
   <div className="floor-wood-choice" role="group" aria-label="Порода древесины"><button aria-pressed={region.wood==='oak'} onClick={()=>onChange({wood:'oak'})}><i style={{background:'#cda77a'}}/>Дуб</button><button aria-pressed={region.wood==='walnut'} onClick={()=>onChange({wood:'walnut'})}><i style={{background:'#69442d'}}/>Тёмный орех</button></div>
   <div className="floor-layout-grid" role="group" aria-label="Раскладка паркета">{parquetLayouts.map(layout=><button key={layout.id} aria-pressed={region.layout===layout.id} aria-label={layout.name} onClick={()=>onChange({layout:layout.id})}><ParquetSwatch layout={layout.id} wood={region.wood}/><b>{layout.name}</b></button>)}</div>
  </>}
  <footer><button onClick={onDelete}>Удалить участок</button>{parquet&&<button className="floor-menu-done" onClick={onClose}>Готово</button>}</footer>
 </div>;
}
