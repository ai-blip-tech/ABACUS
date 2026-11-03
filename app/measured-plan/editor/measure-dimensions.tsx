'use client';
import React,{useRef,useState} from 'react';
import type {PlanDimension,Point,Wall} from '@/lib/measured-plan/measure-model';
import {DimensionLabel} from './measure-dimension-label';
import {offsetDimension,rulerEnd,rulerLength} from '@/lib/measured-plan/measure-ruler';
export function DimensionMark({a,b,font,color='#842b39',offset=0,ruler=false,unit='мм'}:{a:Point;b:Point;font:number;color?:string;offset?:number;ruler?:boolean;unit?:string}){
 const size=rulerLength(a,b)||1,ux=(b[0]-a[0])/size,uy=(b[1]-a[1])/size,nx=-uy,ny=ux,da:Point=[a[0]+nx*offset,a[1]+ny*offset],db:Point=[b[0]+nx*offset,b[1]+ny*offset],angle=Math.atan2(uy,ux)*180/Math.PI,readable=angle>90||angle<-90?angle+180:angle,mid:Point=[(da[0]+db[0])/2,(da[1]+db[1])/2];
 return <g pointerEvents="none">
  {Math.abs(offset)>1&&[a,b].map((point,i)=><line key={'extension-'+i} x1={point[0]} y1={point[1]} x2={point[0]+nx*(offset+Math.sign(offset)*font*.4)} y2={point[1]+ny*(offset+Math.sign(offset)*font*.4)} stroke={color} strokeWidth="1" vectorEffect="non-scaling-stroke"/>)}
  <line x1={da[0]} y1={da[1]} x2={db[0]} y2={db[1]} stroke={color} strokeWidth={ruler?2.8:1.5} strokeDasharray={ruler?'8 5':undefined} vectorEffect="non-scaling-stroke"/>
  {[da,db].map((p,i)=><line key={i} data-dimension-tick x1={p[0]-nx*font*.55-ux*font*.2} y1={p[1]-ny*font*.55-uy*font*.2} x2={p[0]+nx*font*.55+ux*font*.2} y2={p[1]+ny*font*.55+uy*font*.2} stroke={color} strokeWidth={ruler?2.6:1.8} vectorEffect="non-scaling-stroke"/>)}
  <DimensionLabel a={da} b={db} font={font} color={color}>{Math.round(size).toLocaleString('ru-RU')} {unit}</DimensionLabel>
 </g>;
}
export function SavedDimensions({items,selected,onSelect,onEdit,font,pointOf,walls}:{items:PlanDimension[];selected:string;onSelect:(id:string)=>void;onEdit:(id:string,b:Point)=>void;font:number;pointOf:(e:React.PointerEvent)=>Point;walls:Wall[]}){
 const [draft,setDraft]=useState<{id:string;b:Point}|null>(null),drag=useRef<{id:string;a:Point;b:Point;pointerId:number}|null>(null);
 return <g>{items.map(item=>{const b=draft?.id===item.id?draft.b:item.b,shifted=offsetDimension(item.a,b,item.offset);return <g key={item.id} data-extra-dimension={item.id} role="button" tabIndex={0} aria-label={`Дополнительный размер: ${Math.round(rulerLength(item.a,b))} мм`} onClick={e=>{e.stopPropagation();onSelect(item.id);}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(item.id);}}} onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>{const d=drag.current;if(!d||d.id!==item.id||d.pointerId!==e.pointerId)return;e.stopPropagation();d.b=rulerEnd(d.a,pointOf(e),walls,e.altKey);setDraft({id:d.id,b:d.b});}} onPointerUp={e=>{const d=drag.current;if(!d||d.id!==item.id)return;e.stopPropagation();drag.current=null;setDraft(null);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(rulerLength(d.a,d.b)>=1)onEdit(d.id,d.b);}} onPointerCancel={()=>{drag.current=null;setDraft(null);}} style={{cursor:'pointer',touchAction:'none'}}>
 <line x1={shifted.a[0]} y1={shifted.a[1]} x2={shifted.b[0]} y2={shifted.b[1]} stroke="transparent" strokeWidth={font*2.5}/>{selected===item.id&&<line x1={item.a[0]} y1={item.a[1]} x2={b[0]} y2={b[1]} stroke="#842b39" strokeWidth={font*.7} opacity=".22"/>}<DimensionMark a={item.a} b={b} font={font} offset={item.offset||0}/>{selected===item.id&&<line data-extra-dimension-end x1={b[0]-font} y1={b[1]} x2={b[0]+font} y2={b[1]} stroke="transparent" strokeWidth={font*3} style={{cursor:'crosshair'}} onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();e.preventDefault();drag.current={id:item.id,a:item.a,b:item.b,pointerId:e.pointerId};e.currentTarget.parentElement!.setPointerCapture(e.pointerId);}}/>}
 </g>;})}</g>;
}
