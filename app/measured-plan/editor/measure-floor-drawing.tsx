'use client';
import React,{useEffect,useMemo,useRef,useState} from 'react';
import type {Point,MeasureDoc} from '@/lib/measured-plan/measure-model';
import {detectedRooms} from '@/lib/measured-plan/measure-rooms';
import {selectFloorByRectangle} from '@/lib/measured-plan/measure-floor-selection';
import {usablePlanArea} from '@/lib/planning-plan/usable-area';

type Marquee={a:Point;b:Point;pointer:number};
export function MeasureFloorDrawing({doc,view,unit,pointOf,onCommit,onCancel}:{doc:MeasureDoc;view:number[];unit:number;pointOf:(event:React.PointerEvent)=>Point;onCommit:(polygons:Point[][])=>void;onCancel:()=>void}){
 const surface=useMemo(()=>usablePlanArea(doc).polygons,[doc]),rooms=useMemo(()=>detectedRooms(doc),[doc]),drag=useRef<Marquee|null>(null);
 const [marquee,setMarquee]=useState<Marquee|null>(null),[error,setError]=useState('');
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if((event.target as Element).closest('input,textarea,select,[contenteditable=true]'))return;if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(drag.current){drag.current=null;setMarquee(null);setError('');}else onCancel();}};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[onCancel]);
 let selection:ReturnType<typeof selectFloorByRectangle>|null=null;
 if(marquee)try{selection=selectFloorByRectangle(doc,marquee.a,marquee.b,surface,rooms);}catch{/* Degenerate intermediate geometry is not committed. */}
 const label=error||(!marquee?'Зажмите кнопку мыши и обведите область':selection?.regions.length?`${selection.squareMetres.toFixed(2)} м² · отпустите, чтобы добавить пол`:'Обведите область внутри помещения');
 return <g data-floor-drawing data-floor-rectangle-selection style={{cursor:'crosshair',touchAction:'none'}} onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);const p=pointOf(event),next={a:p,b:p,pointer:event.pointerId};drag.current=next;setMarquee(next);setError('');}} onPointerMove={event=>{if(!drag.current||event.pointerId!==drag.current.pointer)return;event.stopPropagation();const next={...drag.current,b:pointOf(event)};drag.current=next;setMarquee(next);}} onPointerUp={event=>{const current=drag.current;if(!current||event.pointerId!==current.pointer)return;event.stopPropagation();drag.current=null;try{const result=selectFloorByRectangle(doc,current.a,pointOf(event),surface,rooms);if(!result.regions.length)throw Error('Обведите рамкой участок внутри помещения');onCommit(result.regions);setMarquee(null);}catch(error){setError(error instanceof Error?error.message:'Не удалось выделить пол');}}} onPointerCancel={()=>{drag.current=null;setMarquee(null);}} onLostPointerCapture={()=>{if(drag.current){drag.current=null;setMarquee(null);}}}>
  <rect x={view[0]-view[2]*10} y={view[1]-view[3]*10} width={view[2]*21} height={view[3]*21} fill="transparent"/>
  {selection&&<g pointerEvents="none"><path d={selection.path} fill="#842b39" fillOpacity=".22" stroke="#842b39" strokeWidth="2" vectorEffect="non-scaling-stroke" fillRule="evenodd"/><polygon points={selection.rectangle.map(p=>p.join(',')).join(' ')} fill="none" stroke="#842b39" strokeDasharray="6 4" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>{selection.rectangle.map((p,i)=><rect key={i} x={p[0]-unit*.3} y={p[1]-unit*.3} width={unit*.6} height={unit*.6} fill="white" stroke="#842b39" strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}</g>}
  {(marquee||error)&&<text x={(marquee?.b[0]??view[0])+unit} y={(marquee?.b[1]??view[1])+unit*2} fontFamily="Arial,sans-serif" fontSize={unit} fill="#842b39" stroke="white" strokeWidth={unit*.3} paintOrder="stroke" pointerEvents="none">{label}</text>}
 </g>;
}
