import type {MultiPolygon} from 'polygon-clipping';
import type {Point} from './measure-model';
import {floorPolygon,editFloorPolygon} from './measure-floor-finishes.ts';
import clipping from 'polygon-clipping';
import {multiArea,ringArea} from '../planning-plan/usable-area.ts';
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function projection(p:Point,a:Point,b:Point):Point{const dx=b[0]-a[0],dy=b[1]-a[1],n=dx*dx+dy*dy,t=n?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/n)):0;return[a[0]+t*dx,a[1]+t*dy];}
function inRing(p:Point,ring:Point[]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[j],b=ring[i];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function inside(p:Point,surface:MultiPolygon){return surface.some(poly=>inRing(p,poly[0])&&!poly.slice(1).some(h=>inRing(p,h)));}
function boundary(p:Point,surface:MultiPolygon){let closest:Point=p,best=Infinity,corner:Point|null=null,cornerDistance=Infinity;for(const poly of surface)for(const ring of poly)for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],q=projection(p,a,b),d=distance(p,q);if(d<best){best=d;closest=q;}const cd=distance(p,a);if(cd<cornerDistance){cornerDistance=cd;corner=a;}}return{point:closest,distance:best,corner,cornerDistance};}
export function constrainFloorPoint(p:Point,surface:MultiPolygon,tolerance=0,anchor?:Point):Point{
 if(!surface.length)return [...p];const nearest=boundary(p,surface);let target:Point=nearest.corner&&nearest.cornerDistance<=tolerance?[...nearest.corner]:nearest.distance<=tolerance||!inside(p,surface)?nearest.point:[...p];
 if(!anchor)return target;
 // Stop at the first wall face along the drag rather than jumping through a wall.
 const a=constrainFloorPoint(anchor,surface),dx=target[0]-a[0],dy=target[1]-a[1],cuts=[0,1];
 for(const poly of surface)for(const ring of poly)for(let i=0;i<ring.length;i++){const b=ring[i],c=ring[(i+1)%ring.length],ex=c[0]-b[0],ey=c[1]-b[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-9)continue;const t=((b[0]-a[0])*ey-(b[1]-a[1])*ex)/den,u=((b[0]-a[0])*dy-(b[1]-a[1])*dx)/den;if(t>0&&t<1&&u>=0&&u<=1)cuts.push(t);}
 cuts.sort((x,y)=>x-y);for(let i=0;i<cuts.length-1;i++){const t=(cuts[i]+cuts[i+1])/2,q:Point=[a[0]+dx*t,a[1]+dy*t];if(!inside(q,surface)&&boundary(q,surface).distance>.01)return[a[0]+dx*cuts[i],a[1]+dy*cuts[i]];}
 return target;
}
export function floorPolygonInside(polygon:Point[],surface:MultiPolygon){const p=floorPolygon(polygon);return !surface.length||ringArea(p)-multiArea(clipping.intersection([p],surface))<1;}
export function constrainFloorEdit(polygon:Point[],kind:'move'|'vertex'|'edge',index:number,delta:Point,surface:MultiPolygon,tolerance:number){
 const base=floorPolygon(polygon.map(p=>constrainFloorPoint(p,surface))),next=editFloorPolygon(base,kind,index,delta);
 if(kind==='vertex'){next[index]=constrainFloorPoint(next[index],surface,tolerance,base[index]);}
 else{let fraction=1;for(let i=0;i<base.length;i++){const dx=next[i][0]-base[i][0],dy=next[i][1]-base[i][1],n=dx*dx+dy*dy;if(n<.001)continue;const q=constrainFloorPoint(next[i],surface,0,base[i]);fraction=Math.min(fraction,Math.max(0,((q[0]-base[i][0])*dx+(q[1]-base[i][1])*dy)/n));}for(let i=0;i<base.length;i++)next[i]=[base[i][0]+(next[i][0]-base[i][0])*fraction,base[i][1]+(next[i][1]-base[i][1])*fraction];}
 const result=floorPolygon(next);if(!floorPolygonInside(result,surface))throw Error('Граница пола не может пересекать стену или колонну');return result;
}
