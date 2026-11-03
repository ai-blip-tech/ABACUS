import type {Opening,Wall} from '@/lib/measured-plan/measure-model';
import {doorSymbol} from '@/lib/measured-plan/measure-editing';
import {DimensionLabel} from './measure-dimension-label';

export function MeasureOpeningPreview({wall,opening,font}:{wall:Wall;opening:Opening;font:number}){
 const size=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1])||1,ux=(wall.b[0]-wall.a[0])/size,uy=(wall.b[1]-wall.a[1])/size,nx=-uy,ny=ux,at=(distance:number)=>[wall.a[0]+ux*distance,wall.a[1]+uy*distance] as [number,number],a=at(opening.offset-opening.width/2),b=at(opening.offset+opening.width/2),symbol=doorSymbol(wall,opening),off=wall.thickness/2+font*1.8,da:[number,number]=[a[0]+nx*off,a[1]+ny*off],db:[number,number]=[b[0]+nx*off,b[1]+ny*off];
 return <g data-opening-placement-preview aria-label={`Предпросмотр: ${opening.kind==='door'?'дверь':'окно'}, ${Math.round(opening.width)} мм`} pointerEvents="none">
  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#fffdf9" strokeWidth={wall.thickness+12}/>
  <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#842b39" strokeWidth={wall.thickness+12} opacity=".18"/>
  {opening.kind==='door'?<><path d={symbol.path+` L ${symbol.hinge[0]} ${symbol.hinge[1]} Z`} fill="#842b3912"/><path d={symbol.path} fill="none" stroke="#842b39" strokeWidth="2" vectorEffect="non-scaling-stroke"/><line x1={symbol.hinge[0]} y1={symbol.hinge[1]} x2={symbol.leaf[0]} y2={symbol.leaf[1]} stroke="#842b39" strokeWidth="3" vectorEffect="non-scaling-stroke"/></>:<g stroke="#842b39" fill="none" strokeWidth="1.8" vectorEffect="non-scaling-stroke">{[-1,1].map(side=><line key={side} x1={a[0]+nx*wall.thickness*.3*side} y1={a[1]+ny*wall.thickness*.3*side} x2={b[0]+nx*wall.thickness*.3*side} y2={b[1]+ny*wall.thickness*.3*side}/>)}<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}/></g>}
  {[a,b].map((p,i)=><line key={i} x1={p[0]-nx*(wall.thickness/2+font*.3)} y1={p[1]-ny*(wall.thickness/2+font*.3)} x2={p[0]+nx*(wall.thickness/2+font*.3)} y2={p[1]+ny*(wall.thickness/2+font*.3)} stroke="#842b39" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}
  <DimensionLabel a={da} b={db} font={font} color="#842b39">{Math.round(opening.width)} мм</DimensionLabel>
 </g>;
}
