import React from 'react';
import type {Wall} from '@/lib/measured-plan/measure-model';
import type {clearWallDimension} from '@/lib/measured-plan/measure-clear-wall';
export function ClearWallMark({wall,m,font}:{wall:Wall;m:NonNullable<ReturnType<typeof clearWallDimension>>;font:number}){
 const l=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),nx=-(wall.b[1]-wall.a[1])/l,ny=(wall.b[0]-wall.a[0])/l;
 const offset=Math.max(wall.thickness,70)/2+font*5,ax=m.a[0]+nx*offset,ay=m.a[1]+ny*offset,bx=m.b[0]+nx*offset,by=m.b[1]+ny*offset,cx=(ax+bx)/2,cy=(ay+by)/2;
 const fmt=(n:number)=>Math.round(n).toLocaleString('ru-RU');
 return <g className="selected-clear-dimension" data-selected-clear-dimension role="img" aria-label={'Чистый размер '+fmt(m.length)+' мм: '+m.label}>
  <path d={`M ${m.a[0]} ${m.a[1]} L ${ax+nx*font} ${ay+ny*font} M ${m.b[0]} ${m.b[1]} L ${bx+nx*font} ${by+ny*font}`} fill="none" stroke="#000000" strokeWidth={font*.1} strokeDasharray={font*.3+' '+font*.3}/>
  <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#000000" strokeWidth={font*.12}/>
  {[[m.a[0],m.a[1],ax,ay],[m.b[0],m.b[1],bx,by]].map(([x,y,tx,ty],i)=><g key={i}><circle cx={x} cy={y} r={font*.4} fill="white" stroke="#000000" strokeWidth={font*.15}/><line x1={tx-nx*font*.65} y1={ty-ny*font*.65} x2={tx+nx*font*.65} y2={ty+ny*font*.65} stroke="#000000" strokeWidth={font*.18}/></g>)}
  <text x={cx} y={cy-font*.6} textAnchor="middle" fontSize={font*1.1} fill="#000000" stroke="#fffdf7" strokeWidth={font*.5} paintOrder="stroke" transform={`rotate(${Math.abs(wall.b[1]-wall.a[1])>Math.abs(wall.b[0]-wall.a[0])?-90:0} ${cx} ${cy})`}>{fmt(m.length)} мм</text>
 </g>;
}
