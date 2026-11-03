import type {Point,Wall} from '@/lib/measured-plan/measure-model';
import {length} from '@/lib/measured-plan/measure-model';
import {wallAngle} from '@/lib/measured-plan/measure-opening-guides';

export function WallEditGuides({wall,walls,font}:{wall:Wall;walls:Wall[];font:number}){
 const size=length(wall)||1,ux=(wall.b[0]-wall.a[0])/size,uy=(wall.b[1]-wall.a[1])/size,nx=-uy,ny=ux,mid:Point=[(wall.a[0]+wall.b[0])/2,(wall.a[1]+wall.b[1])/2];
 const candidates=walls.filter(other=>other.id!==wall.id).map(other=>{const otherSize=length(other)||1,parallel=Math.abs((other.b[0]-other.a[0])*uy-(other.b[1]-other.a[1])*ux)/otherSize<.04,d=((other.a[0]+other.b[0])/2-mid[0])*nx+((other.a[1]+other.b[1])/2-mid[1])*ny;return{other,d,parallel};}).filter(item=>item.parallel&&Math.abs(item.d)>1).sort((a,b)=>Math.abs(a.d)-Math.abs(b.d)).slice(0,2);
 return <g data-wall-edit-guides pointerEvents="none"><text x={mid[0]-ny*font*1.2} y={mid[1]+nx*font*1.2} fontSize={font*.9} textAnchor="middle" fill="#842b39" stroke="#fffdf9" strokeWidth={font*.28} paintOrder="stroke">{Math.round(size).toLocaleString('ru-RU')} мм · {wallAngle(wall)}°</text>{candidates.map(({other,d})=>{const q:Point=[mid[0]+nx*d,mid[1]+ny*d],label:Point=[(mid[0]+q[0])/2,(mid[1]+q[1])/2];return <g key={other.id}><line x1={mid[0]} y1={mid[1]} x2={q[0]} y2={q[1]} stroke="#842b39" strokeWidth="1" strokeDasharray="5 4" vectorEffect="non-scaling-stroke"/><text x={label[0]} y={label[1]-font*.35} textAnchor="middle" fontSize={font*.8} fill="#842b39" stroke="#fffdf9" strokeWidth={font*.25} paintOrder="stroke">{Math.round(Math.abs(d)).toLocaleString('ru-RU')} мм</text></g>;})}</g>;
}
