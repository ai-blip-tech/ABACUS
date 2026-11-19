import type {MultiPolygon} from 'polygon-clipping';
import type {Point} from '@/lib/measured-plan/measure-model';
import {floorDrawingDimensions} from '@/lib/measured-plan/floor-drawing-dimensions';
import {DimensionLabel} from './measure-dimension-label';
const names={top:'сверху',right:'справа',bottom:'снизу',left:'слева'};
export function FloorDrawingDimensions({selection,surface,unit,showSize=true}:{selection:MultiPolygon;surface:MultiPolygon;unit:number;showSize?:boolean}){
 const dimensions=floorDrawingDimensions(selection,surface),format=(n:number)=>Math.round(n).toLocaleString('ru-RU')+' мм';
 return <g data-floor-drawing-dimensions aria-label="Размеры участка и отступы до стен" pointerEvents="none">{dimensions.filter(d=>showSize||d.kind==='clearance').map((d,i)=>{
  const clearance=d.kind==='clearance',color=clearance?'#94162f':'#26211e',offset:Point=d.kind==='width'?[0,-unit*2.2]:d.kind==='height'?[unit*2.2,0]:[0,0],a:Point=[d.a[0]+offset[0],d.a[1]+offset[1]],b:Point=[d.b[0]+offset[0],d.b[1]+offset[1]],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.5)return null;
  const nx=-(b[1]-a[1])/length*unit*.35,ny=(b[0]-a[0])/length*unit*.35;
  return <g key={i} aria-label={(clearance?'Отступ '+names[d.side]:d.kind==='width'?'Ширина участка':'Глубина участка')+': '+format(d.value)} data-floor-dimension={d.kind} data-floor-clearance={clearance?d.side:undefined}>
   {!clearance&&[d.a,d.b].map((p,j)=><line key={j} x1={p[0]} y1={p[1]} x2={p[0]+offset[0]} y2={p[1]+offset[1]} stroke={color} strokeWidth=".8" opacity=".5" vectorEffect="non-scaling-stroke"/>)}
   <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={clearance?1.2:1.5} strokeDasharray={clearance?'5 3':undefined} vectorEffect="non-scaling-stroke"/>
   {[a,b].map((p,j)=><line key={j} x1={p[0]-nx} y1={p[1]-ny} x2={p[0]+nx} y2={p[1]+ny} stroke={color} strokeWidth="1.3" vectorEffect="non-scaling-stroke"/>)}
   {clearance?<>{d.side==='right'&&<line x1={(a[0]+b[0])/2} y1={(a[1]+b[1])/2} x2={(a[0]+b[0])/2} y2={(a[1]+b[1])/2+unit*2.1} stroke={color} strokeWidth=".7" vectorEffect="non-scaling-stroke"/>}{(d.side==='top'||d.side==='bottom')&&<line x1={(a[0]+b[0])/2} y1={(a[1]+b[1])/2} x2={(a[0]+b[0])/2+unit*2.8} y2={(a[1]+b[1])/2} stroke={color} strokeWidth=".7" vectorEffect="non-scaling-stroke"/>}<text x={(a[0]+b[0])/2+(d.side==='top'||d.side==='bottom'?unit*3.5:0)} y={(a[1]+b[1])/2+(d.side==='right'?unit*3.4:d.side==='left'?-unit*.55:unit*.35)} textAnchor={d.side==='top'||d.side==='bottom'?'start':'middle'} fontFamily="Arial, Helvetica, sans-serif" fontSize={unit*.95} fontWeight="600" fill={color} stroke="#fffdf9" strokeWidth={unit*.32} paintOrder="stroke">{format(d.value)}</text></>:<DimensionLabel a={a} b={b} font={unit*1.08} color={color}>{format(d.value)}</DimensionLabel>}
  </g>;
 })}</g>;
}
