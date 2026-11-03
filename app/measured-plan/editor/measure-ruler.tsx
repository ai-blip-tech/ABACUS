'use client';
import React,{useRef,useState} from 'react';
import type {Point,Wall} from '@/lib/measured-plan/measure-model';
import {dimensionOffset,rulerAngle,rulerEnd,rulerLength,snapMeasurePoint} from '@/lib/measured-plan/measure-ruler';
import {DimensionMark} from './measure-dimensions';
const burgundy='#842b39';
export function MeasureRuler({walls,view,font,pointOf,calibrated,onFinish}:{walls:Wall[];view:number[];font:number;pointOf:(e:React.PointerEvent)=>Point;calibrated:boolean;onFinish?:(a:Point,b:Point,offset?:number)=>void}){
 const [a,setA]=useState<Point|null>(null),[b,setB]=useState<Point|null>(null),[placing,setPlacing]=useState(false),[offset,setOffset]=useState(0),[hover,setHover]=useState<{point:Point;label:string}|null>(null);
 const drag=useRef<{pointerId:number;anchor:Point;end:Point;offsetStage:boolean}|null>(null);
 const finished=useRef(false);
 const distance=a&&b?Math.round(rulerLength(a,b)):null,unit=calibrated?'мм':'усл. ед.',tolerance=font*.9;
 const endpoint=(anchor:Point,p:Point,free:boolean)=>{const snapped=snapMeasurePoint(p,walls,tolerance,free);return snapped.label?snapped.point:rulerEnd(anchor,p,walls,free);};
 const down=(e:React.PointerEvent<SVGGElement>)=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();const p=snapMeasurePoint(pointOf(e),walls,tolerance,e.altKey).point,anchor=a||p;setA(anchor);if(a&&!placing)setB(endpoint(anchor,p,e.altKey));drag.current={pointerId:e.pointerId,anchor,end:p,offsetStage:placing};e.currentTarget.setPointerCapture(e.pointerId);};
 const move=(e:React.PointerEvent<SVGGElement>)=>{e.stopPropagation();const p=pointOf(e),snapped=snapMeasurePoint(p,walls,tolerance,e.altKey);setHover(snapped);const d=drag.current;
  if(placing&&a&&b){setOffset(dimensionOffset(a,b,p));return;}
  if(a&&(!finished.current||d)&&(!d||d.pointerId===e.pointerId)){const end=endpoint(a,p,e.altKey);setB(end);if(d)d.end=end;}
 };
 const up=(e:React.PointerEvent<SVGGElement>)=>{e.stopPropagation();const d=drag.current;if(!d)return;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null;
  if(d.offsetStage&&a&&b&&onFinish){onFinish(a,b,dimensionOffset(a,b,pointOf(e)));setA(null);setB(null);setOffset(0);setPlacing(false);return;}
  if(a&&b&&rulerLength(a,b)>=1){if(onFinish)setPlacing(true);else finished.current=true;}
 };
 const angle=a&&b?rulerAngle(a,b):0;
 return <g data-measure-ruler aria-label={distance===null?'Линейка: укажите две точки':`Линейка: ${distance} ${unit}, ${angle.toFixed(1)}°`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{drag.current=null;}} style={{touchAction:'none',cursor:'crosshair'}}>
  <rect x={view[0]-view[2]*10} y={view[1]-view[3]*10} width={view[2]*21} height={view[3]*21} fill="transparent"/>
  {a&&!b&&<line x1={a[0]} y1={a[1]-font*.75} x2={a[0]} y2={a[1]+font*.75} stroke={burgundy} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>}
  {a&&b&&<><DimensionMark a={a} b={b} font={font} color={burgundy} offset={placing?offset:0} ruler={!onFinish} unit={unit}/><line data-ruler-end x1={b[0]-font} y1={b[1]} x2={b[0]+font} y2={b[1]} stroke="transparent" strokeWidth={font*3}/>
   {!onFinish&&<g transform={`translate(${b[0]+font*1.1} ${b[1]+font*1.1})`}><rect x={-font*.25} y={-font*.9} width={font*3.6} height={font*1.4} rx={font*.25} fill={burgundy}/><text fontSize={font*.85} fill="white">{angle.toFixed(1)}°</text></g>}
  </>}
  {hover?.label&&<g pointerEvents="none"><path d={`M ${hover.point[0]-font*.4} ${hover.point[1]} H ${hover.point[0]+font*.4} M ${hover.point[0]} ${hover.point[1]-font*.4} V ${hover.point[1]+font*.4}`} stroke={burgundy} strokeWidth="2.5" vectorEffect="non-scaling-stroke"/><text x={hover.point[0]+font*.75} y={hover.point[1]-font*.8} fill={burgundy} stroke="#fffdf9" strokeWidth={font*.3} paintOrder="stroke" fontSize={font*.7}>{hover.label}</text></g>}
  {placing&&b&&<text x={b[0]+font} y={b[1]+font*2.7} fontSize={font*.7} fill={burgundy} stroke="white" strokeWidth={font*.25} paintOrder="stroke">Отведите размер и нажмите</text>}
 </g>;
}
