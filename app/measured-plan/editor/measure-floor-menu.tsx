'use client';
import {useState} from 'react';
import {floorPlacement,parquetLayouts,type FloorRegion} from '@/lib/measured-plan/measure-floor-finishes';
import {ParquetSwatch} from './measure-parquet-pattern';
import './measure-floor.css';

export function FloorFinishMenu({region,area,onChange,onClose,onDelete}:{region:FloorRegion;area:number;onChange:(patch:Partial<Pick<FloorRegion,'layout'|'wood'|'origin'|'angle'>>)=>void;onClose:()=>void;onDelete:()=>void}){
 const [parquet,setParquet]=useState(!!region.layout);
 return <section className="floor-finish-menu floor-finish-panel" data-floor-menu aria-label="Параметры участка пола">
  <header><div><b>Участок пола</b><small>{area.toFixed(2)} м²</small></div><button type="button" aria-label="Закрыть выбор пола" onClick={onClose}>×</button></header><p className="floor-edit-hint">Тяните углы, середины граней или весь участок на плане. Esc — снять выделение.</p>
  {!parquet?<button className="floor-material-entry" onClick={()=>setParquet(true)}><ParquetSwatch layout="straight" wood={region.wood}/><span>Паркет</span><span>›</span></button>:<>
   <div className="floor-wood-choice" role="group" aria-label="Порода древесины"><button aria-pressed={region.wood==='oak'} onClick={()=>onChange({wood:'oak'})}><i style={{background:'#cda77a'}}/>Дуб</button><button aria-pressed={region.wood==='walnut'} onClick={()=>onChange({wood:'walnut'})}><i style={{background:'#69442d'}}/>Тёмный орех</button></div>
   <div className="floor-layout-grid" role="group" aria-label="Раскладка паркета">{parquetLayouts.map(layout=><button key={layout.id} aria-pressed={region.layout===layout.id} aria-label={layout.name} onClick={()=>onChange({layout:layout.id})}><ParquetSwatch layout={layout.id} wood={region.wood}/><b>{layout.name}</b></button>)}</div>
  </>}
  {region.layout&&<div className="floor-axis-settings"><b>Ось раскладки А–А</b><label>Направление, °<input type="number" aria-label="Направление паркета, градусы" value={Math.round(floorPlacement(region).angle)} onChange={event=>{if(event.target.value!==''&&Number.isFinite(event.target.valueAsNumber))onChange({angle:((event.target.valueAsNumber%360)+360)%360});}}/></label><button onClick={()=>onChange({angle:(floorPlacement(region).angle+90)%360})}>Повернуть на 90°</button><small>Ромб — начало раскладки. Круглая ручка на стрелке — поворот. Перетаскивайте их прямо на плане.</small></div>}
  <footer><button onClick={onDelete}>Удалить участок</button>{parquet&&<button className="floor-menu-done" onClick={onClose}>Готово</button>}</footer>
 </section>;
}
