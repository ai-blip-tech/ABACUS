import type {Wall,Point} from '../measured-plan/measure-model';
import type {FurnitureItem} from './furniture';
/** Align either furniture edge to a nearby finite wall, including diagonal walls.
 * Keep the nearest quarter-turn: never flip the front/back of an item. */
export function snapFurnitureAngle(item:FurnitureItem,walls:Wall[],position:Point=item.position,tolerance=8,reach=180):number{
 let bestAngle=item.rotation,bestGap=Infinity,bestDelta=Infinity;
 const r=item.rotation*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
 for(const w of walls){
  const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],length=Math.hypot(dx,dy);if(length<.01||!Number.isFinite(w.thickness)||w.thickness<=0)continue;
  const tx=dx/length,ty=dy/length,nx=-ty,ny=tx,px=position[0]-w.a[0],py=position[1]-w.a[1];
  const support=(x:number,y:number)=>Math.abs(c*x+s*y)*item.width/2+Math.abs(-s*x+c*y)*item.depth/2;
  const along=px*tx+py*ty;if(along < -support(tx,ty)||along>length+support(tx,ty))continue;
  const gap=Math.abs(px*nx+py*ny)-w.thickness/2-support(nx,ny);if(gap>reach||gap < -reach)continue;
  const wallAngle=Math.atan2(dy,dx)*180/Math.PI,candidate=wallAngle+Math.round((item.rotation-wallAngle)/90)*90,delta=Math.abs(candidate-item.rotation);
  if(delta<=tolerance&&(Math.abs(gap)<bestGap-1e-6||Math.abs(Math.abs(gap)-bestGap)<1e-6&&delta<bestDelta)){bestAngle=candidate;bestGap=Math.abs(gap);bestDelta=delta;}
 }
 return bestAngle;
}
