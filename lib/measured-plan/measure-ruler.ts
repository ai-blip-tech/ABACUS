import type {Point,Wall} from './measure-model.ts';
export function rulerEnd(anchor:Point,point:Point,walls:Wall[],free=false):Point{
 if(free)return [...point];const dx=point[0]-anchor[0],dy=point[1]-anchor[1],size=Math.hypot(dx,dy);if(!size)return [...point];
 const angle=Math.atan2(dy,dx),angles=[0,Math.PI/2,Math.PI,-Math.PI/2];for(const w of walls){if(Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])<1)continue;const a=Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);for(let i=0;i<4;i++)angles.push(a+i*Math.PI/2);}
 const difference=(a:number)=>Math.abs(Math.atan2(Math.sin(angle-a),Math.cos(angle-a))),nearest=angles.sort((a,b)=>difference(a)-difference(b))[0];if(difference(nearest)>Math.PI/36)return [...point];return [anchor[0]+Math.cos(nearest)*size,anchor[1]+Math.sin(nearest)*size];
}
export function rulerLength(a:Point,b:Point){return Math.hypot(b[0]-a[0],b[1]-a[1]);}
