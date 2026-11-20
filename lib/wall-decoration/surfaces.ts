import type {MeasureDoc,Point,Wall} from '../measured-plan/measure-model';
import {detectedRooms,type DetectedRoom} from '../measured-plan/measure-rooms.ts';
export type WallPart={wallId:string;side:1|-1;from:number;to:number};
export type WallSurface={id:string;roomId:string;roomName:string;a:Point;b:Point;normal:Point;parts:WallPart[];heightMm:number;temporaryHeight:boolean;order:number;previous?:string;next?:string};
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
export const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export function inside(p:Point,ring:Point[]){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function projectToSegment(p:Point,a:Point,b:Point){const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;const point:Point=[a[0]+t*dx,a[1]+t*dy];return{point,distance:distance(p,point),t};}
function matchEdge(a:Point,b:Point,walls:Wall[]):WallPart[]{
 const length=distance(a,b);if(length<1)return[];const axis:Point=[(b[0]-a[0])/length,(b[1]-a[1])/length],mid:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
 return walls.flatMap(w=>{const L=distance(w.a,w.b);if(L<1)return[];const t:Point=[(w.b[0]-w.a[0])/L,(w.b[1]-w.a[1])/L];if(Math.abs(dot(t,axis))<.999)return[];const signed=(mid[0]-w.a[0])*(-t[1])+(mid[1]-w.a[1])*t[0];if(Math.abs(Math.abs(signed)-w.thickness/2)>Math.max(3,w.thickness*.05))return[];const x=(p:Point)=>(p[0]-w.a[0])*t[0]+(p[1]-w.a[1])*t[1],from=Math.max(0,Math.min(x(a),x(b))),to=Math.min(L,Math.max(x(a),x(b)));return to-from>1?[{wallId:w.id,side:signed>=0?1:-1,from,to}]:[];});
}
/** Room boundary faces, not drawing-segment counts. Door openings do not split a face. */
export function wallSurfaces(plan:MeasureDoc,rooms:DetectedRoom[]=detectedRooms(plan)):WallSurface[]{
 return rooms.flatMap(room=>{
  const ring=room.polygon.slice();if(distance(ring[0],ring.at(-1)!)<.1)ring.pop();
  type Edge={a:Point;b:Point;parts:WallPart[]};const raw:Edge[]=ring.map((a,i)=>({a,b:ring[(i+1)%ring.length],parts:matchEdge(a,ring[(i+1)%ring.length],plan.walls)}));
  const sameLine=(a:Edge,b:Edge)=>a.parts.length&&b.parts.length&&distance(a.b,b.a)<1&&Math.abs((a.b[0]-a.a[0])*(b.b[1]-b.a[1])-(a.b[1]-a.a[1])*(b.b[0]-b.a[0]))<distance(a.a,a.b)*distance(b.a,b.b)*.0001;
  const merged:Edge[]=[];for(const e of raw){const last=merged.at(-1);if(last&&sameLine(last,e)){last.b=e.b;last.parts.push(...e.parts);}else merged.push({...e,parts:[...e.parts]});}
  if(merged.length>1&&sameLine(merged.at(-1)!,merged[0])){const last=merged.pop()!;merged[0]={a:last.a,b:merged[0].b,parts:[...last.parts,...merged[0].parts]};}
  // In screen coordinates, clockwise order has positive signed area.
  const signed=ring.reduce((n,a,i)=>{const b=ring[(i+1)%ring.length];return n+a[0]*b[1]-b[0]*a[1];},0);if(signed<0)merged.reverse();
  const start=merged.reduce((best,e,i)=>Math.min(e.a[1],e.b[1])<Math.min(merged[best].a[1],merged[best].b[1])-.1||Math.abs(Math.min(e.a[1],e.b[1])-Math.min(merged[best].a[1],merged[best].b[1]))<.1&&Math.min(e.a[0],e.b[0])<Math.min(merged[best].a[0],merged[best].b[0])?i:best,0);
  const ordered=[...merged.slice(start),...merged.slice(0,start)].filter(e=>e.parts.length);
  const result=ordered.map((e,order)=>{
   const length=distance(e.a,e.b),middle:Point=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2];let normal:Point=[-(e.b[1]-e.a[1])/length,(e.b[0]-e.a[0])/length];if(!inside([middle[0]+normal[0]*2,middle[1]+normal[1]*2],ring))normal=[-normal[0],-normal[1]];
   // Screen-right vector is (normal.y, -normal.x); keep doors left/right correct.
   const reverse=(e.b[0]-e.a[0])*normal[1]-(e.b[1]-e.a[1])*normal[0]<0,a=reverse?e.b:e.a,b=reverse?e.a:e.b;
   const parts=[...new Map(e.parts.map(p=>[p.wallId+':'+p.side,p])).values()];
   const heightMm=Math.max(...parts.map(p=>plan.walls.find(w=>w.id===p.wallId)!.height||plan.height||2800));
   return{id:`${room.id}:${parts.map(p=>`${p.wallId}.${p.side}.${Math.round(p.from)}.${Math.round(p.to)}`).sort().join('|')}`,roomId:room.id,roomName:room.name,a,b,normal,parts,heightMm,temporaryHeight:parts.some(p=>!plan.walls.find(w=>w.id===p.wallId)!.height&&!plan.height),order} as WallSurface;
  });
  return result.map((s,i)=>({...s,previous:result[(i-1+result.length)%result.length]?.id,next:result[(i+1)%result.length]?.id}));
 });
}
export function selectedWallQueue(surfaces:WallSurface[],selected:string[]){const picked=selected.map(id=>surfaces.find(s=>s.id===id)).filter(Boolean) as WallSurface[],rooms=[...new Set(picked.map(s=>s.roomId))];return rooms.flatMap(room=>{const list=picked.filter(s=>s.roomId===room).sort((a,b)=>a.order-b.order),first=picked.find(s=>s.roomId===room)!,i=list.findIndex(s=>s.id===first.id);return [...list.slice(i),...list.slice(0,i)];});}
export function wallWorkContext(surface:WallSurface,surfaces:WallSurface[],corner:'left'|'right'|null=null){
 const adjacent=surfaces.filter(s=>s.roomId===surface.roomId&&s.id!==surface.id&&[s.a,s.b].some(p=>[surface.a,surface.b].some(q=>distance(p,q)<5)));
 return{surface,adjacent,corner};
}
