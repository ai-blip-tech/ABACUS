import type React from 'react';
import type {Wall} from '@/lib/measured-plan/measure-model';

export function MeasureWallHandles({wall,font,zoom,onStart}:{wall:Wall;font:number;zoom:number;onStart:(e:React.PointerEvent,w:Wall,mode:string)=>void}){
 const size=font/zoom,l=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1])||1,dx=(wall.b[0]-wall.a[0])/l,dy=(wall.b[1]-wall.a[1])/l;
 const rx=wall.b[0]+dx*size*3.5,ry=wall.b[1]+dy*size*3.5;
 return <g data-measure-wall={wall.id} aria-label="Ручки выбранной стены">
  <line x1={wall.b[0]} y1={wall.b[1]} x2={rx} y2={ry} stroke="#842b39" strokeWidth="1" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
  {(['a','b'] as const).map(endpoint=>{const p=wall[endpoint],a=[p[0]-dy*size*.8,p[1]+dx*size*.8],b=[p[0]+dy*size*.8,p[1]-dx*size*.8];return <g key={endpoint} role="button" aria-label={endpoint==='a'?'Начало стены — изменить длину':'Конец стены — изменить длину'} style={{cursor:'crosshair',touchAction:'none'}} onPointerDown={e=>onStart(e,wall,endpoint)}>
   <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="transparent" strokeWidth="24" vectorEffect="non-scaling-stroke" pointerEvents="stroke"/>
   <line data-wall-end-mark x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#842b39" strokeWidth="2" vectorEffect="non-scaling-stroke" pointerEvents="none"/>
  </g>;})}
  <g role="button" aria-label="Повернуть стену" style={{cursor:'grab',touchAction:'none'}} onPointerDown={e=>onStart(e,wall,'rotate')}>
   <rect x={rx-size*1.1} y={ry-size*1.1} width={size*2.2} height={size*2.2} rx={size*.25} fill="white" fillOpacity=".9" stroke="#842b39" strokeWidth="1" vectorEffect="non-scaling-stroke"/>
   <text x={rx} y={ry+size*.4} textAnchor="middle" fontSize={size*1.5} fill="#842b39" pointerEvents="none">↻</text>
  </g>
 </g>;
}
