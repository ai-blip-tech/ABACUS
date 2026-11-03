'use client';
import {useEffect,useMemo,useRef,useState,type PointerEvent} from 'react';
import type {Point,MeasureDoc} from '@/lib/measured-plan/measure-model';
import {type FloorRegion} from '@/lib/measured-plan/measure-floor-finishes';
import {constrainFloorEdit,constrainFloorPoint} from '@/lib/measured-plan/measure-floor-constraints';
import {usablePlanArea} from '@/lib/planning-plan/usable-area';

type Drag={pointer:number;start:Point;polygon:Point[];kind:'move'|'edge'|'vertex';index:number};
export function MeasureFloorEdit({region,doc,unit,pointOf,onChange,onBegin,onEnd,onCancel}:{region:FloorRegion;doc:MeasureDoc;unit:number;pointOf:(event:PointerEvent)=>Point;onChange:(polygon:Point[])=>void;onBegin:()=>void;onEnd:()=>void;onCancel:()=>void}){
 const surface=useMemo(()=>usablePlanArea(doc).polygons,[doc.walls,doc.openings,doc.columns,doc.floor]);
 const drag=useRef<Drag|null>(null),[invalid,setInvalid]=useState(false);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&drag.current){event.preventDefault();event.stopImmediatePropagation();drag.current=null;setInvalid(false);onCancel();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[onCancel]);
 function start(event:PointerEvent<SVGElement>,kind:Drag['kind'],index=0){if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);drag.current={pointer:event.pointerId,start:pointOf(event),polygon:region.polygon.map(p=>constrainFloorPoint(p,surface)),kind,index};onBegin();}
 function move(event:PointerEvent<SVGGElement>){const d=drag.current;if(!d||d.pointer!==event.pointerId)return;event.stopPropagation();const p=pointOf(event),delta:Point=[p[0]-d.start[0],p[1]-d.start[1]];let shift=delta;
  if(!event.altKey&&d.kind!=='move'){const a=d.polygon[d.index],b=d.polygon[(d.index+1)%d.polygon.length],anchor:Point=d.kind==='vertex'?a:[(a[0]+b[0])/2,(a[1]+b[1])/2],candidate:Point=[anchor[0]+delta[0],anchor[1]+delta[1]],snap=constrainFloorPoint(candidate,surface,unit*1.2);shift=[snap[0]-anchor[0],snap[1]-anchor[1]];}
  try{onChange(constrainFloorEdit(d.polygon,d.kind,d.index,shift,surface,event.altKey?0:unit*1.2));setInvalid(false);}catch{setInvalid(true);}
 }
 function end(event:PointerEvent<SVGGElement>){if(!drag.current||drag.current.pointer!==event.pointerId)return;event.stopPropagation();drag.current=null;setInvalid(false);onEnd();}
 return <g data-floor-edit aria-label="Границы участка пола" onPointerMove={move} onPointerUp={end} onPointerCancel={()=>{if(drag.current){drag.current=null;setInvalid(false);onCancel();}}} onClick={event=>event.stopPropagation()} style={{touchAction:'none'}}>
  <polygon points={region.polygon.map(p=>p.join(',')).join(' ')} fill="transparent" stroke={invalid?'#c43c3c':'#842b39'} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeDasharray="7 4" style={{cursor:'move'}} onPointerDown={event=>start(event,'move')}/>
  {region.polygon.map((a,i)=>{const b=region.polygon[(i+1)%region.polygon.length],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2,n=Math.hypot(b[0]-a[0],b[1]-a[1]);return <g key={i}>
   <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth="12" vectorEffect="non-scaling-stroke" style={{cursor:Math.abs(b[0]-a[0])>Math.abs(b[1]-a[1])?'ns-resize':'ew-resize'}} onPointerDown={event=>start(event,'edge',i)}/>
   <rect x={x-unit*.35} y={y-unit*.35} width={unit*.7} height={unit*.7} rx={unit*.12} fill="white" stroke="#842b39" strokeWidth="1.7" vectorEffect="non-scaling-stroke" style={{cursor:'move'}} onPointerDown={event=>start(event,'edge',i)}/>
   <text x={x} y={y-unit*.75} textAnchor="middle" fontSize={unit*.9} fill="#842b39" stroke="white" strokeWidth={unit*.25} paintOrder="stroke" pointerEvents="none">{Math.round(n)} мм</text>
  </g>;})}
  {region.polygon.map((p,i)=><circle key={i} aria-label={`Угол пола ${i+1}`} cx={p[0]} cy={p[1]} r={unit*.5} fill="white" stroke="#842b39" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{cursor:'move'}} onPointerDown={event=>start(event,'vertex',i)}/>)}
 </g>;
}
