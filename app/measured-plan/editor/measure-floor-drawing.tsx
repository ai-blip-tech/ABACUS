'use client';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {Point,MeasureDoc} from '@/lib/measured-plan/measure-model';
import {floorPolygon} from '@/lib/measured-plan/measure-floor-finishes';
import {constrainFloorPoint,floorPolygonInside} from '@/lib/measured-plan/measure-floor-constraints';
import {usablePlanArea} from '@/lib/planning-plan/usable-area';

export function MeasureFloorDrawing({doc,view,unit,pointOf,onCommit,onCancel}:{doc:MeasureDoc;view:number[];unit:number;pointOf:(event:React.PointerEvent)=>Point;onCommit:(polygon:Point[],at:{x:number;y:number})=>void;onCancel:()=>void}){
 const surface=useMemo(()=>usablePlanArea(doc).polygons,[doc]);
 const [points,setPoints]=useState<Point[]>([]),[hover,setHover]=useState<Point|null>(null),[error,setError]=useState(''),lastAt=useRef({x:window.innerWidth/2,y:window.innerHeight/2});
 const finish=()=>{try{const polygon=floorPolygon(points);if(!floorPolygonInside(polygon,surface))throw Error('Граница пола не может пересекать стену или колонну');onCommit(polygon,lastAt.current);}catch(error){setError(error instanceof Error?error.message:'Проверьте контур');}};
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.target as Element).closest('input,textarea,select,[contenteditable=true]'))return;if(event.key==='Enter'){event.preventDefault();finish();}if(event.key==='Escape'){event.preventDefault();onCancel();}if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();event.stopImmediatePropagation();setPoints(p=>p.slice(0,-1));}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);});
 function candidate(event:React.PointerEvent):Point{let p=pointOf(event);const last=points.at(-1);if(last&&!event.altKey){if(Math.abs(p[0]-last[0])<unit*.8)p=[last[0],p[1]];else if(Math.abs(p[1]-last[1])<unit*.8)p=[p[0],last[1]];}return constrainFloorPoint(p,surface,event.altKey?0:unit*1.2,last);}

 return <g data-floor-drawing style={{cursor:'crosshair'}} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();lastAt.current={x:event.clientX,y:event.clientY};const p=candidate(event);if(points.length>=3&&Math.hypot(p[0]-points[0][0],p[1]-points[0][1])<unit*1.2){finish();return;}if(points.length&&Math.hypot(p[0]-points.at(-1)![0],p[1]-points.at(-1)![1])<1)return;setPoints(previous=>[...previous,p]);setError('');}} onPointerMove={event=>{event.stopPropagation();setHover(candidate(event));lastAt.current={x:event.clientX,y:event.clientY};}} onDoubleClick={event=>{event.stopPropagation();event.preventDefault();if(points.length>=3)finish();}}>
  <rect x={view[0]-view[2]*10} y={view[1]-view[3]*10} width={view[2]*21} height={view[3]*21} fill="transparent"/>
  {points.length>0&&<><polygon points={[...points,...(hover?[hover]:[])].map(p=>p.join(',')).join(' ')} fill="#842b39" fillOpacity=".1" stroke="#842b39" strokeWidth="1.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" pointerEvents="none"/>{points.map((p,i)=><rect key={i} x={p[0]-unit*.3} y={p[1]-unit*.3} width={unit*.6} height={unit*.6} fill={i===0?'#842b39':'white'} stroke="#842b39" strokeWidth="1.5" vectorEffect="non-scaling-stroke" pointerEvents="none"/>)}</>}
  {hover&&<g pointerEvents="none"><path d={`M ${hover[0]-unit*.5} ${hover[1]} H ${hover[0]+unit*.5} M ${hover[0]} ${hover[1]-unit*.5} V ${hover[1]+unit*.5}`} stroke="#842b39" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/><text x={hover[0]+unit} y={hover[1]-unit} fontFamily="Arial,sans-serif" fontSize={unit*.8} fill="#842b39" stroke="white" strokeWidth={unit*.25} paintOrder="stroke">{error|| (points.length>=3?'Клик по началу или Enter — замкнуть':`Пол · углов: ${points.length}`)}</text></g>}
 </g>;
}
