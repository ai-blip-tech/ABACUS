import type {Point,Wall} from './measure-model';
export type PolygonGuide={point:Point;direction:Point;wall:Wall;relation:'parallel'|'perpendicular'};
/** Snap to actual wall bearings, including diagonal walls, within a screen-space tolerance. */
export function polygonWallGuide(anchor:Point,cursor:Point,walls:Wall[],tolerance:number):PolygonGuide|null{
 const dx=cursor[0]-anchor[0],dy=cursor[1]-anchor[1],length=Math.hypot(dx,dy);if(length<1)return null;
 let best:PolygonGuide|null=null,bestError=Infinity,bestDistance=Infinity;
 for(const wall of walls){const wx=wall.b[0]-wall.a[0],wy=wall.b[1]-wall.a[1],wl=Math.hypot(wx,wy);if(wl<1)continue;
 for(const relation of ['parallel','perpendicular'] as const){const u:Point=relation==='parallel'?[wx/wl,wy/wl]:[-wy/wl,wx/wl],along=dx*u[0]+dy*u[1],error=Math.abs(dx*u[1]-dy*u[0]);
 const wallDistance=Math.hypot((wall.a[0]+wall.b[0])/2-anchor[0],(wall.a[1]+wall.b[1])/2-anchor[1]);
 if(error<=Math.min(tolerance,length*Math.sin(Math.PI/60))&&(error<bestError-.001||Math.abs(error-bestError)<.001&&wallDistance<bestDistance)){bestError=error;bestDistance=wallDistance;best={point:[anchor[0]+along*u[0],anchor[1]+along*u[1]],direction:u,wall,relation};}
 }}return best;
}
export function polygonSegmentDimensions(points:Point[],cursor?:Point|null){const all=cursor?[...points,cursor]:points;return all.slice(1).flatMap((b,i)=>{const a=all[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);return length>.5?[{a,b,length,live:!!cursor&&i===all.length-2}]:[];});}
