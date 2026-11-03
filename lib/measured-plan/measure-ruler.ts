import type {Point,Wall} from './measure-model.ts';
export function rulerEnd(anchor:Point,point:Point,walls:Wall[],free=false):Point{
 if(free)return [...point];const dx=point[0]-anchor[0],dy=point[1]-anchor[1],size=Math.hypot(dx,dy);if(!size)return [...point];
 const angle=Math.atan2(dy,dx),angles=[0,Math.PI/2,Math.PI,-Math.PI/2];for(const w of walls){if(Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])<1)continue;const a=Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);for(let i=0;i<4;i++)angles.push(a+i*Math.PI/2);}
 const difference=(a:number)=>Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a))),nearest=angles.sort((a,b)=>difference(a)-difference(b))[0];if(difference(nearest)>Math.PI/36)return [...point];return [anchor[0]+Math.cos(nearest)*size,anchor[1]+Math.sin(nearest)*size];
}
export function rulerLength(a:Point,b:Point){return Math.hypot(b[0]-a[0],b[1]-a[1]);}

export function rulerAngle(a:Point,b:Point){return (Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+360)%360;}
export function dimensionOffset(a:Point,b:Point,p:Point){const size=rulerLength(a,b)||1;return ((p[0]-a[0])*(-(b[1]-a[1]))+(p[1]-a[1])*(b[0]-a[0]))/size;}
export function offsetDimension(a:Point,b:Point,offset=0):{a:Point;b:Point}{const size=rulerLength(a,b)||1,nx=-(b[1]-a[1])/size*offset,ny=(b[0]-a[0])/size*offset;return{a:[a[0]+nx,a[1]+ny],b:[b[0]+nx,b[1]+ny]};}

/** Prefer corners and midpoints, then project onto the actual wall faces or axis. */
export function snapMeasurePoint(point:Point,walls:Wall[],tolerance:number,free=false):{point:Point;label:string}{
 if(free)return{point:[...point],label:''};
 const candidates:{point:Point;label:string;distance:number;priority:number}[]=[];
 for(const wall of walls){const size=rulerLength(wall.a,wall.b);if(size<1)continue;const ux=(wall.b[0]-wall.a[0])/size,uy=(wall.b[1]-wall.a[1])/size;
  for(const face of [-wall.thickness/2,0,wall.thickness/2]){const a:Point=[wall.a[0]-uy*face,wall.a[1]+ux*face],b:Point=[wall.b[0]-uy*face,wall.b[1]+ux*face];
   for(const [p,label] of [[a,'Конец стены'],[b,'Конец стены'],[[(a[0]+b[0])/2,(a[1]+b[1])/2] as Point,'Середина стены']] as [Point,string][]){const distance=rulerLength(point,p);if(distance<=tolerance)candidates.push({point:p,label,distance,priority:0});}
   const along=Math.max(0,Math.min(size,(point[0]-a[0])*ux+(point[1]-a[1])*uy)),p:Point=[a[0]+ux*along,a[1]+uy*along],distance=rulerLength(point,p);if(distance<=tolerance)candidates.push({point:p,label:face===0?'Ось стены':'Грань стены',distance,priority:1});
  }
 }
 candidates.sort((a,b)=>a.priority-b.priority||a.distance-b.distance);return candidates[0]||{point:[...point],label:''};
}
