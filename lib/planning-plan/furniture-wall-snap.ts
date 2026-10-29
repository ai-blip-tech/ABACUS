import type {Point,Wall} from '../measured-plan/measure-model';
import type {FurnitureItem} from './furniture';

type Box={center:Point;axes:[Point,Point];half:Point};
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const add=(a:Point,b:Point,k=1):Point=>[a[0]+b[0]*k,a[1]+b[1]*k];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const radius=(b:Box,n:Point)=>Math.abs(dot(b.axes[0],n))*b.half[0]+Math.abs(dot(b.axes[1],n))*b.half[1];
function furnitureBox(item:FurnitureItem,center:Point):Box{const a=item.rotation*Math.PI/180;return{center,axes:[[Math.cos(a),Math.sin(a)],[-Math.sin(a),Math.cos(a)]],half:[item.width/2,item.depth/2]};}
function wallBox(w:Wall):Box|null{const d=sub(w.b,w.a),l=Math.hypot(...d);if(l<.01||!Number.isFinite(w.thickness)||w.thickness<=0)return null;return{center:add(w.a,d,.5),axes:[[d[0]/l,d[1]/l],[-d[1]/l,d[0]/l]],half:[l/2,w.thickness/2]};}
// Continuous separating-axis test: a fast pointer jump cannot tunnel through a wall.
function sweep(a:Box,b:Box,delta:Point):{time:number;normal:Point}|null{
 let enter=-Infinity,exit=Infinity,normal:Point=[0,0];
 for(const n of [...a.axes,...b.axes]){
  const p=dot(sub(a.center,b.center),n),r=radius(a,n)+radius(b,n),v=dot(delta,n);
  if(Math.abs(v)<1e-9){if(Math.abs(p)>=r-1e-7)return null;continue;}
  const t1=(-r-p)/v,t2=(r-p)/v,lo=Math.min(t1,t2),hi=Math.max(t1,t2);
  if(lo>enter){enter=lo;normal=[n[0]*-Math.sign(v),n[1]*-Math.sign(v)];}exit=Math.min(exit,hi);
  if(enter>exit)return null;
 }
 return enter>=-1e-8&&enter<=1&&exit>1e-8?{time:Math.max(0,enter),normal}:null;
}
function penetration(a:Box,b:Box):Point|null{
 let depth=Infinity,offset:Point=[0,0];
 for(const n of [...a.axes,...b.axes]){const p=dot(sub(a.center,b.center),n),overlap=radius(a,n)+radius(b,n)-Math.abs(p);if(overlap<=1e-6)return null;if(overlap<depth){depth=overlap;offset=[n[0]*(overlap+1e-5)*(p<0?-1:1),n[1]*(overlap+1e-5)*(p<0?-1:1)];}}
 return offset;
}
/** Millimetres. Translation only: never changes walls, item dimensions or rotation. */
export function snapFurnitureToWalls(item:FurnitureItem,previous:Point,desired:Point,walls:Wall[],tolerance=60):Point{
 const obstacles=walls.map(wallBox).filter((b):b is Box=>!!b);
 let position:Point=[...previous];
 // Old documents may already contain overlaps; allow dragging the object out.
 for(let i=0;i<12;i++){const hit=obstacles.map(b=>penetration(furnitureBox(item,position),b)).find(Boolean);if(!hit)break;position=add(position,hit);}
 let remaining=sub(desired,position);
 for(let i=0;i<4;i++){
  const box=furnitureBox(item,position);let nearest:ReturnType<typeof sweep>=null;
  for(const wall of obstacles){const hit=sweep(box,wall,remaining);if(hit&&(!nearest||hit.time<nearest.time))nearest=hit;}
  if(!nearest){position=add(position,remaining);break;}
  position=add(position,remaining,nearest.time);remaining=[remaining[0]*(1-nearest.time),remaining[1]*(1-nearest.time)];
  const inward=dot(remaining,nearest.normal);if(inward<0)remaining=add(remaining,nearest.normal,-inward);
 }
 // Magnetise to finite wall faces, not their infinite extensions. At a corner
 // two independent face snaps may apply, but never introduce another overlap.
 for(let pass=0;pass<2;pass++){
  const box=furnitureBox(item,position);let best:Point|null=null,bestGap=Infinity;
  for(const wall of obstacles){const tangent=wall.axes[0],normal=wall.axes[1],d=sub(position,wall.center),along=dot(d,tangent);
   if(Math.abs(along)>=wall.half[0]+radius(box,tangent)-1e-6)continue;
   const signed=dot(d,normal),gap=Math.abs(signed)-wall.half[1]-radius(box,normal);
   if(gap<1e-6||gap>tolerance||gap>=bestGap)continue;
   const candidate=add(position,normal,-Math.sign(signed)*gap);
   if(obstacles.some(w=>penetration(furnitureBox(item,candidate),w)))continue;
   best=candidate;bestGap=gap;
  }
  if(!best)break;position=best;
 }
 // Contradictory narrow gaps must not yield a new invalid position.
 return obstacles.some(w=>penetration(furnitureBox(item,position),w))?previous:position;
}
