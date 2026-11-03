import type {Point,Wall} from '@/lib/measured-plan/measure-model';

import {DimensionLabel} from './measure-dimension-label';

const format=(value:number)=>Math.round(value).toLocaleString('ru-RU');

export function MeasureWallDimensions({walls,floor,font,onEdit}:{walls:Wall[];floor:Point[];font:number;onEdit:(wall:Wall,value:number,at:Point)=>void}){
 const center=floor.length?floor.reduce<Point>((sum,point)=>[sum[0]+point[0]/floor.length,sum[1]+point[1]/floor.length],[0,0]):[0,0] as Point;
 return <g data-wall-overview-dimensions>{walls.map(wall=>{
  const dx=wall.b[0]-wall.a[0],dy=wall.b[1]-wall.a[1],value=Math.hypot(dx,dy);if(value<100)return null;
  const ux=dx/value,uy=dy/value,mid:Point=[(wall.a[0]+wall.b[0])/2,(wall.a[1]+wall.b[1])/2];
  let nx=-uy,ny=ux;if(nx*(center[0]-mid[0])+ny*(center[1]-mid[1])>0){nx*=-1;ny*=-1;}
  const offset=wall.thickness/2+font*1.7,a:Point=[wall.a[0]+nx*offset,wall.a[1]+ny*offset],b:Point=[wall.b[0]+nx*offset,wall.b[1]+ny*offset],label:Point=[mid[0]+nx*(offset+font*.45),mid[1]+ny*(offset+font*.45)],angle=Math.atan2(dy,dx)*180/Math.PI,readable=angle>90||angle<-90?angle+180:angle;
  return <g key={wall.id} role="button" tabIndex={0} aria-label={`${format(value)} мм — изменить длину стены`} style={{cursor:'text'}} onClick={event=>{event.stopPropagation();onEdit(wall,value,label);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();onEdit(wall,value,label);}}}>
   <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#000000" strokeWidth="1.15" vectorEffect="non-scaling-stroke"/>
   {[a,b].map((point,index)=><line key={index} x1={point[0]-nx*font*.42} y1={point[1]-ny*font*.42} x2={point[0]+nx*font*.42} y2={point[1]+ny*font*.42} stroke="#000000" strokeWidth="1.15" vectorEffect="non-scaling-stroke"/>)}
   <DimensionLabel a={a} b={b} font={font}>{format(value)} мм</DimensionLabel>
  </g>;
 })}</g>;
}
