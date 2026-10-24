'use client';
import React,{useRef,useState} from 'react';
import type {Point,Wall} from '@/lib/measured-plan/measure-model';
import {rulerEnd,rulerLength} from '@/lib/measured-plan/measure-ruler';
import {DimensionMark} from './measure-dimensions';
export function MeasureRuler({walls,view,font,pointOf,calibrated,onFinish}:{walls:Wall[];view:number[];font:number;pointOf:(e:React.PointerEvent)=>Point;calibrated:boolean;onFinish?:(a:Point,b:Point)=>void}){
 const [a,setA]=useState<Point|null>(null),[b,setB]=useState<Point|null>(null),drag=useRef<{pointerId:number;anchor:Point;first:boolean}|null>(null);
 const distance=a&&b?Math.round(rulerLength(a,b)):null,unit=calibrated?'мм':'усл. ед. — масштаб не задан';
 const down=(e:React.PointerEvent<SVGGElement>)=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const p=pointOf(e),anchor=a||p;setA(anchor);if(a)setB(rulerEnd(anchor,p,walls,e.altKey));drag.current={pointerId:e.pointerId,anchor,first:!a};e.currentTarget.setPointerCapture(e.pointerId);};
 const move=(e:React.PointerEvent<SVGGElement>)=>{e.stopPropagation();const d=drag.current;if(!d||d.pointerId!==e.pointerId)return;const p=pointOf(e);if(d.first&&rulerLength(d.anchor,p)<20)return;setB(rulerEnd(d.anchor,p,walls,e.altKey));};
 const up=(e:React.PointerEvent<SVGGElement>)=>{e.stopPropagation();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null;if(onFinish&&a&&b&&rulerLength(a,b)>=1){onFinish(a,b);setA(null);setB(null);}};
 return <g data-measure-ruler aria-label={distance===null?'Линейка: укажите две точки':`Линейка: ${distance} ${unit}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{touchAction:'none',cursor:'crosshair'}}>
  <rect x={view[0]-view[2]*10} y={view[1]-view[3]*10} width={view[2]*21} height={view[3]*21} fill="transparent"/>
  {a&&!b&&<line x1={a[0]} y1={a[1]-font*.75} x2={a[0]} y2={a[1]+font*.75} stroke={"#000000"} strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>}
  {a&&b&&<><DimensionMark a={a} b={b} font={font} color={"#000000"}/><line data-ruler-end x1={b[0]-font} y1={b[1]} x2={b[0]+font} y2={b[1]} stroke="transparent" strokeWidth={font*3}/></>}
 </g>;
}
