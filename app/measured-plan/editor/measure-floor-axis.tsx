'use client';
import {useEffect,useMemo,useRef,type PointerEvent} from 'react';
import {floorPlacement,type FloorRegion} from '@/lib/measured-plan/measure-floor-finishes';
import type {MeasureDoc,Point} from '@/lib/measured-plan/measure-model';
import {usablePlanArea} from '@/lib/planning-plan/usable-area';
import {constrainFloorPoint} from '@/lib/measured-plan/measure-floor-constraints';

export function MeasureFloorAxis({region,doc,unit,pointOf,onChange,onBegin,onEnd,onCancel}:{region:FloorRegion;doc:MeasureDoc;unit:number;pointOf:(event:PointerEvent)=>Point;onChange:(patch:Partial<Pick<FloorRegion,'origin'|'angle'>>)=>void;onBegin:()=>void;onEnd:()=>void;onCancel:()=>void}){
 const {origin,angle}=floorPlacement(region),surface=useMemo(()=>usablePlanArea(doc).polygons,[doc.walls,doc.openings,doc.floor,doc.columns]),drag=useRef<'origin'|'angle'|null>(null);
 const rad=angle*Math.PI/180,ux=Math.cos(rad),uy=Math.sin(rad),radius=unit*5.5,projections=region.polygon.map(p=>(p[0]-origin[0])*ux+(p[1]-origin[1])*uy),lo=Math.min(...projections)-unit*1.5,hi=Math.max(...projections)+unit*1.5;
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();e.stopImmediatePropagation();drag.current=null;onCancel();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[onCancel]);
 function start(e:PointerEvent<SVGElement>,mode:'origin'|'angle'){if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current=mode;onBegin();}
 const text={fontFamily:'Arial,sans-serif',fontSize:unit*.95,fill:'#842b39',stroke:'#fffdf7',strokeWidth:unit*.3,paintOrder:'stroke' as const};
 return <g data-floor-axis aria-label="Ось и направление раскладки паркета" onClick={e=>e.stopPropagation()} onPointerMove={e=>{if(!drag.current)return;e.stopPropagation();const p=pointOf(e);if(drag.current==='angle'){let degrees=(Math.atan2(p[1]-origin[1],p[0]-origin[0])*180/Math.PI+360)%360;const snap=Math.round(degrees/45)*45;if(!e.altKey&&Math.abs(degrees-snap)<5)degrees=snap;onChange({angle:degrees%360});}else{let q=constrainFloorPoint(p,surface,unit*1.2);if(!e.altKey){const xs=region.polygon.map(p=>p[0]),ys=region.polygon.map(p=>p[1]),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;if(Math.abs(q[0]-cx)<unit)q=[cx,q[1]];if(Math.abs(q[1]-cy)<unit)q=[q[0],cy];}onChange({origin:q});}}} onPointerUp={e=>{if(drag.current){e.stopPropagation();drag.current=null;onEnd();}}} onPointerCancel={()=>{if(drag.current){drag.current=null;onCancel();}}} style={{touchAction:'none'}}>
  <line x1={origin[0]+ux*lo} y1={origin[1]+uy*lo} x2={origin[0]+ux*hi} y2={origin[1]+uy*hi} stroke="white" strokeWidth="3.5" opacity=".8" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
  <line x1={origin[0]+ux*lo} y1={origin[1]+uy*lo} x2={origin[0]+ux*hi} y2={origin[1]+uy*hi} stroke="#842b39" strokeWidth="1.2" strokeDasharray="10 4 2 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
  {[-1,1].map(side=><text key={side} x={origin[0]+side*ux*(radius+unit*2)} y={origin[1]+side*uy*(radius+unit*2)-unit*.8} {...text} textAnchor="middle" pointerEvents="none">А</text>)}
  <path d={`M ${origin[0]+Math.cos(rad-.35)*radius} ${origin[1]+Math.sin(rad-.35)*radius} A ${radius} ${radius} 0 0 1 ${origin[0]+Math.cos(rad+.35)*radius} ${origin[1]+Math.sin(rad+.35)*radius}`} fill="none" stroke="#842b39" strokeWidth="1.2" vectorEffect="non-scaling-stroke" opacity=".8" style={{cursor:'grab'}} onPointerDown={e=>start(e,'angle')}/>
  <g transform={`translate(${origin.join(' ')}) rotate(${angle})`} style={{cursor:'grab'}} onPointerDown={e=>start(e,'angle')}>
   <line x1={unit} y1={0} x2={radius-unit*.8} y2={0} stroke="white" strokeWidth="6" vectorEffect="non-scaling-stroke"/>
   <line x1={unit} y1={0} x2={radius-unit*.8} y2={0} stroke="#842b39" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
   <path d={`M ${radius-unit*1.5} ${-unit*.65} L ${radius-unit*.7} 0 L ${radius-unit*1.5} ${unit*.65}`} fill="none" stroke="#842b39" strokeWidth="3" vectorEffect="non-scaling-stroke"/>
   <circle aria-label="Повернуть направление паркета" cx={radius} cy={0} r={unit*.48} fill="white" stroke="#842b39" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
  </g>
  <path aria-label="Переместить начало раскладки" d={`M ${origin[0]} ${origin[1]-unit*.65} l ${unit*.65} ${unit*.65} l ${-unit*.65} ${unit*.65} l ${-unit*.65} ${-unit*.65} Z`} fill="white" stroke="#842b39" strokeWidth="2" vectorEffect="non-scaling-stroke" style={{cursor:'move'}} onPointerDown={e=>start(e,'origin')}/>
  <text x={origin[0]+unit} y={origin[1]+unit*1.8} {...text} pointerEvents="none">Начало · {Math.round(angle)}°</text>
 </g>;
}
