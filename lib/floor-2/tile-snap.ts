import type {Point} from '../measured-plan/measure-model';
import {floorPlacement} from '../measured-plan/measure-floor-finishes.ts';
import {regionProduct,type Floor2Region} from './model.ts';

/** Snap to both real tile edges, including the two faces of a grout joint. */
export function snapTileCorner(point:Point,regions:Floor2Region[],selectedId:string,tolerance:number):{point:Point;snapped:boolean}{
 let best:Point=point,distance=Infinity;
 for(const r of [...regions.filter(r=>r.id!==selectedId),...regions.filter(r=>r.id===selectedId)]){
  const p=regionProduct(r);if(p?.category!=='tile'||!['straight','diagonal','offset'].includes(r.scheme||'straight'))continue;
  const {origin,angle}=floorPlacement(r),rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),x=(point[0]-origin[0])*c+(point[1]-origin[1])*s,y=-(point[0]-origin[0])*s+(point[1]-origin[1])*c,joint=r.tile?.jointMm??2,px=p.widthMm+joint,py=p.heightMm+joint;
  const nearest=(value:number,pitch:number,length:number)=>[Math.round(value/pitch)*pitch,Math.round((value-length)/pitch)*pitch+length].sort((a,b)=>Math.abs(a-value)-Math.abs(b-value))[0];
  const gy=nearest(y,py,p.heightMm),row=Math.round(gy/py),shift=r.scheme==='offset'&&Math.abs(row%2)?px*(r.rowOffset??1/3):0,gx=nearest(x-shift,px,p.widthMm)+shift;
  if(Math.abs(gx-x)>tolerance||Math.abs(gy-y)>tolerance)continue;
  const candidate:Point=[origin[0]+gx*c-gy*s,origin[1]+gx*s+gy*c],d=Math.hypot(candidate[0]-point[0],candidate[1]-point[1]);if(d<distance){distance=d;best=candidate;}
 }
 return {point:best,snapped:distance<Infinity};
}
