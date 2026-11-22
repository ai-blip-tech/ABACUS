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

export type SeamGuide={a:Point;b:Point;axis:'x'|'y';neighborId:string};
/** Align grout centre lines independently; moving a pattern never resizes a zone. */
export function snapPatternSeams(origin:Point,selected:Floor2Region,regions:Floor2Region[],tolerance:number):{point:Point;snapped:boolean;guides:SeamGuide[]}{
 const product=regionProduct(selected),guides:SeamGuide[]=[];if(product?.category!=='tile'||!['straight','diagonal'].includes(selected.scheme||'straight'))return {point:origin,snapped:false,guides};
 const angle=floorPlacement(selected).angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),j=selected.tile?.jointMm??2,px=product.widthMm+j,py=product.heightMm+j;
 const project=(p:Point):Point=>[p[0]*c+p[1]*s,-p[0]*s+p[1]*c],world=(p:Point):Point=>[p[0]*c-p[1]*s,p[0]*s+p[1]*c];
 const proposed=project(origin),best=[Infinity,Infinity],value=[...proposed],neighbors:(Floor2Region|null)[]=[null,null];
 const box=(r:Floor2Region)=>{const xs=r.polygon.map(p=>p[0]),ys=r.polygon.map(p=>p[1]);return [Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];},a=box(selected);
 for(const other of regions){if(other.id===selected.id)continue;const p=regionProduct(other);if(!p||p.id!==product.id||p.widthMm!==product.widthMm||p.heightMm!==product.heightMm||(other.tile?.jointMm??2)!==j||(other.scheme||'straight')!==(selected.scheme||'straight'))continue;
  const b=box(other);if(Math.hypot(Math.max(0,a[0]-b[2],b[0]-a[2]),Math.max(0,a[1]-b[3],b[1]-a[3]))>600)continue;
  const placement=floorPlacement(other),period=product.widthMm===product.heightMm?90:180,degrees=((placement.angle-floorPlacement(selected).angle)%period+period)%period;if(Math.min(degrees,period-degrees)>.01)continue;
  const r=placement.angle*Math.PI/180,nc=Math.cos(r),ns=Math.sin(r),seam=project([placement.origin[0]-nc*j/2+ns*j/2,placement.origin[1]-ns*j/2-nc*j/2]);
  for(const axis of [0,1]){const pitch=axis===0?px:py,phase=seam[axis]+j/2,candidate=phase+Math.round((proposed[axis]-phase)/pitch)*pitch,d=Math.abs(candidate-proposed[axis]);if(d<=tolerance&&d<best[axis]){best[axis]=d;value[axis]=candidate;neighbors[axis]=other;}}
 }
 for(const axis of [0,1]){const other=neighbors[axis];if(!other)continue;const points=[...selected.polygon,...other.polygon].map(project),across=1-axis,lo=Math.min(...points.map(p=>p[across])),hi=Math.max(...points.map(p=>p[across])),mid=points.reduce((n,p)=>n+p[axis],0)/points.length,pitch=axis===0?px:py,line=value[axis]-j/2+Math.round((mid-value[axis]+j/2)/pitch)*pitch;
  guides.push({axis:axis===0?'x':'y',neighborId:other.id,a:world(axis===0?[line,lo]:[lo,line]),b:world(axis===0?[line,hi]:[hi,line])});
 }
 return {point:world(value as Point),snapped:guides.length>0,guides};
}
