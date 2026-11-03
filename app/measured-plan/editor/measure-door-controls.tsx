import type {Opening,Point,Wall} from '@/lib/measured-plan/measure-model';
import {length} from '@/lib/measured-plan/measure-model';

type Patch=Pick<Opening,'hingesSide'|'swingDirection'>;

function Arrow({at,angle,active,label,font,onClick}:{at:Point;angle:number;active:boolean;label:string;font:number;onClick:()=>void}){
 const radius=font*.62;
 return <g role="button" tabIndex={0} aria-label={label} style={{cursor:'pointer'}} transform={`translate(${at[0]} ${at[1]}) rotate(${angle})`} onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onClick();}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();onClick();}}}>
  <circle r={radius} fill={active?'#842b39':'#fffdf9'} stroke="#842b39" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>
  <path d={`M ${-radius*.35} 0 H ${radius*.32} M ${radius*.04} ${-radius*.26} L ${radius*.34} 0 ${radius*.04} ${radius*.26}`} fill="none" stroke={active?'#fff':'#842b39'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
 </g>;
}

export function MeasureDoorControls({wall,opening,font,onChange}:{wall:Wall;opening:Opening;font:number;onChange:(patch:Partial<Patch>)=>void}){
 if(opening.kind!=='door')return null;
 const size=length(wall)||1,ux=(wall.b[0]-wall.a[0])/size,uy=(wall.b[1]-wall.a[1])/size,nx=-uy,ny=ux,center:Point=[wall.a[0]+ux*opening.offset,wall.a[1]+uy*opening.offset],along=Math.max(opening.width/2+font*1.15,font*2),across=wall.thickness/2+font*1.55,wallAngle=Math.atan2(uy,ux)*180/Math.PI;
 const left:Point=[center[0]-ux*along,center[1]-uy*along],right:Point=[center[0]+ux*along,center[1]+uy*along],sideA:Point=[center[0]+nx*across,center[1]+ny*across],sideB:Point=[center[0]-nx*across,center[1]-ny*across];
 return <g data-door-inline-controls>
  <Arrow at={left} angle={wallAngle+180} active={(opening.hingesSide||'left')==='left'} label="Петли слева" font={font} onClick={()=>onChange({hingesSide:'left'})}/>
  <Arrow at={right} angle={wallAngle} active={opening.hingesSide==='right'} label="Петли справа" font={font} onClick={()=>onChange({hingesSide:'right'})}/>
  <Arrow at={sideA} angle={wallAngle+90} active={(opening.swingDirection||'inward')==='inward'} label="Открывание на сторону A" font={font} onClick={()=>onChange({swingDirection:'inward'})}/>
  <Arrow at={sideB} angle={wallAngle-90} active={opening.swingDirection==='outward'} label="Открывание на сторону B" font={font} onClick={()=>onChange({swingDirection:'outward'})}/>
 </g>;
}
