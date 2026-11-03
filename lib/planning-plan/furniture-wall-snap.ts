import type {Point,Wall} from '../measured-plan/measure-model';
import type {FurnitureItem} from './furniture';

type Box={center:Point;axes:[Point,Point];half:Point};
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1];
const add=(a:Point,b:Point,k=1):Point=>[a[0]+b[0]*k,a[1]+b[1]*k];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const radius=(b:Box,n:Point)=>Math.abs(dot(b.axes[0],n))*b.half[0]+Math.abs(dot(b.axes[1],n))*b.half[1];
function furnitureBox(item:FurnitureItem,center:Point):Box{const a=item.rotation*Math.PI/180;return{center,axes:[[Math.cos(a),Math.sin(a)],[-Math.sin(a),Math.cos(a)]],half:[item.width/2,item.depth/2]};}
function wallBox(w:Wall):Box|null{const d=sub(w.b,w.a),l=Math.hypot(...d);if(l<.01||!Number.isFinite(w.thickness)||w.thickness<=0)return null;return{center:add(w.a,d,.5),axes:[[d[0]/l,d[1]/l],[-d[1]/l,d[0]/l]],half:[l/2,w.thickness/2]};}

/** A short-range magnet only. Walls never block a drag or force a previous position. */
export function snapFurnitureToWalls(item:FurnitureItem,_previous:Point,desired:Point,walls:Wall[],tolerance=60):Point{
 let position:Point=[...desired];
 if(tolerance<=0)return position;
 for(let pass=0;pass<2;pass++){
  const box=furnitureBox(item,position);let best:Point|null=null,bestGap=Infinity;
  for(const wall of walls.map(wallBox).filter((b):b is Box=>!!b)){
   const tangent=wall.axes[0],normal=wall.axes[1],d=sub(position,wall.center),along=dot(d,tangent);
   if(Math.abs(along)>=wall.half[0]+radius(box,tangent)-1e-6)continue;
   const signed=dot(d,normal),gap=Math.abs(signed)-wall.half[1]-radius(box,normal),distance=Math.abs(gap);
   if(distance<1e-6||distance>tolerance||distance>=bestGap)continue;
   best=add(position,normal,-(signed<0?-1:1)*gap);bestGap=distance;
  }
  if(!best)break;position=best;
 }
 return position;
}

/** Visible contact segment, only when an actual furniture edge lies against a wall face. */
export function furnitureWallContacts(item:FurnitureItem,walls:Wall[],tolerance=2):{wallId:string;a:Point;b:Point}[]{
 const box=furnitureBox(item,item.position),contacts:{wallId:string;a:Point;b:Point}[]=[];
 for(const source of walls){
  const wall=wallBox(source);if(!wall)continue;const tangent=wall.axes[0],normal=wall.axes[1];
  if(!box.axes.some(axis=>Math.abs(dot(axis,tangent))>0.9999))continue;
  const d=sub(item.position,wall.center),signed=dot(d,normal),gap=Math.abs(signed)-wall.half[1]-radius(box,normal);
  if(Math.abs(gap)>tolerance)continue;
  const along=dot(d,tangent),extent=radius(box,tangent),start=Math.max(-wall.half[0],along-extent),end=Math.min(wall.half[0],along+extent);
  if(end-start<=1)continue;
  const face=add(wall.center,normal,(signed<0?-1:1)*wall.half[1]);
  contacts.push({wallId:source.id,a:add(face,tangent,start),b:add(face,tangent,end)});
 }
 return contacts;
}
