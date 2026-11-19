'use client';
import {useEffect,useRef,useState,type PointerEvent} from 'react';
import type {MeasureDoc,Point} from '@/lib/measured-plan/measure-model';
import {floorPlacement} from '@/lib/measured-plan/measure-floor-finishes';
import {constrainFloorPoint} from '@/lib/measured-plan/measure-floor-constraints';
import {geometry,type Floor2Region} from '@/lib/floor-2/model';

export function FloorPatternHandle({region,doc,unit,pointOf,onChange,onBegin,onEnd,onCancel,snapPoint}:{snapPoint?:(p:Point)=>{point:Point;snapped:boolean};region:Floor2Region;doc:MeasureDoc;unit:number;pointOf:(e:PointerEvent)=>Point;onChange:(p:{origin?:Point;angle?:number})=>void;onBegin:()=>void;onEnd:()=>void;onCancel:()=>void}){
 const [snapped,setSnapped]=useState(false);
 const placement=floorPlacement(region),shape=geometry(doc,region).polygons;
 const center=constrainFloorPoint([region.polygon.reduce((v,p)=>v+p[0],0)/region.polygon.length,region.polygon.reduce((v,p)=>v+p[1],0)/region.polygon.length],shape);
 const drag=useRef<{mode:'move'|'rotate';start:Point;origin:Point;angle:number;center:Point}|null>(null);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopImmediatePropagation();drag.current=null;onCancel();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[onCancel]);
 function start(e:PointerEvent<SVGElement>,mode:'move'|'rotate'){if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.closest('[data-floor-pattern-handle]')!.setPointerCapture(e.pointerId);drag.current={mode,start:pointOf(e),origin:[...placement.origin],angle:placement.angle,center};setSnapped(false);onBegin();}
 return <g data-floor-pattern-handle aria-label="Управление рисунком покрытия" style={{touchAction:'none'}} onClick={e=>e.stopPropagation()} onPointerMove={e=>{const d=drag.current;if(!d)return;e.stopPropagation();const p=pointOf(e);if(d.mode==='move'){const origin:Point=[d.origin[0]+p[0]-d.start[0],d.origin[1]+p[1]-d.start[1]],snap=!e.altKey?snapPoint?.(origin):undefined;setSnapped(!!snap?.snapped);onChange({origin:snap?.point||origin});}else{const delta=(Math.atan2(p[1]-d.center[1],p[0]-d.center[0])-Math.atan2(d.start[1]-d.center[1],d.start[0]-d.center[0]))*180/Math.PI;let angle=(d.angle+delta+720)%360;const snap=Math.round(angle/45)*45;if(!e.altKey&&Math.abs(angle-snap)<4)angle=snap%360;onChange({angle});}}} onPointerUp={e=>{if(drag.current){e.stopPropagation();drag.current=null;onEnd();}}} onPointerCancel={()=>{if(drag.current){drag.current=null;onCancel();}}}>
  <g transform={`translate(${center.join(' ')})`}>
   <g role="button" aria-label="Переместить рисунок укладки" style={{cursor:'move'}} onPointerDown={e=>start(e,'move')}><title>Сдвинуть рисунок укладки</title><circle r={unit*1.3} fill="#fffdfa" stroke={snapped?'#23864b':'#94162f'} strokeWidth="1.7" vectorEffect="non-scaling-stroke"/><path d={`M ${-unit*.8} 0 H ${unit*.8} M 0 ${-unit*.8} V ${unit*.8} M ${-unit*.5} ${-unit*.3} L ${-unit*.8} 0 ${-unit*.5} ${unit*.3} M ${unit*.5} ${-unit*.3} L ${unit*.8} 0 ${unit*.5} ${unit*.3} M ${-unit*.3} ${-unit*.5} L 0 ${-unit*.8} ${unit*.3} ${-unit*.5} M ${-unit*.3} ${unit*.5} L 0 ${unit*.8} ${unit*.3} ${unit*.5}`} fill="none" stroke={snapped?'#23864b':'#94162f'} strokeWidth="1.8" vectorEffect="non-scaling-stroke"/></g>
   <g transform={`rotate(${placement.angle})`}><line x1={unit*1.5} x2={unit*4} y1="0" y2="0" stroke={snapped?'#23864b':'#94162f'} strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none"/><circle role="button" aria-label="Повернуть рисунок укладки" cx={unit*4} cy="0" r={unit*.65} fill="white" stroke={snapped?'#23864b':'#94162f'} strokeWidth="2" vectorEffect="non-scaling-stroke" style={{cursor:'grab'}} onPointerDown={e=>start(e,'rotate')}><title>Повернуть рисунок укладки</title></circle></g>
  </g>
 </g>;
}
