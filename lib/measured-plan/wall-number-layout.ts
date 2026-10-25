import type {MeasureDoc,Point} from './measure-model.ts';
import {doorSymbol} from './measure-editing.ts';
import {planDrawingDimensions,openingWidthMarks} from './measure-annotations.ts';
import {planHeightLabels,heightLabelPosition} from './measure-heights.ts';
type Box={left:number;right:number;top:number;bottom:number};
function inside(p:Point,poly:Point[]){let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}
function edgeDistance(p:Point,a:Point,b:Point){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t);}
const overlap=(a:Box,b:Box)=>a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;
export function wallNumberMarks(doc:MeasureDoc,font:number){
 const fontSize=font*.9,halfWidth=font*.8,halfHeight=font*.6,gap=font*.65;
 const heightBoxes=planHeightLabels(doc).walls.map(item=>{const w=doc.walls.find(w=>w.id===item.id)!,p=heightLabelPosition(doc,w,item.label,font),half=item.label.length*font*.3;return {left:p.x-half,right:p.x+half,top:p.y-font*1.5,bottom:p.y+font*.1};});
 const doorBoxes=doc.openings.filter(o=>o.kind==='door').flatMap(o=>{const w=doc.walls.find(w=>w.id===o.wallId);if(!w)return[];const s=doorSymbol(w,o),pts=[s.hinge,s.closed,s.leaf];return [{left:Math.min(...pts.map(p=>p[0])),right:Math.max(...pts.map(p=>p[0])),top:Math.min(...pts.map(p=>p[1])),bottom:Math.max(...pts.map(p=>p[1]))}];});
 const dimensionBoxes=planDrawingDimensions(doc).map(d=>{const vertical=Math.abs(d.b[1]-d.a[1])>Math.abs(d.b[0]-d.a[0]),x=(d.a[0]+d.b[0])/2,y=(d.a[1]+d.b[1])/2;return {left:x-font*(vertical?1:3.5),right:x+font*(vertical?1:3.5),top:y-font*(vertical?3.5:1.5),bottom:y+font*(vertical?3.5:.5)};});
 const openingBoxes=openingWidthMarks(doc,font).map(m=>{const vertical=Math.abs(m.db[1]-m.da[1])>Math.abs(m.db[0]-m.da[0]),x=(m.da[0]+m.db[0])/2,y=(m.da[1]+m.db[1])/2;return{left:x-font*(vertical?0:3),right:x+font*(vertical?5:3),top:y-font,bottom:y+font};});
 const placed:Box[]=[];
 return doc.walls.map((w,i)=>{
  const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],size=Math.hypot(dx,dy)||1,cx=(w.a[0]+w.b[0])/2,cy=(w.a[1]+w.b[1])/2;
  // Canonical world-space normal: endpoint reversal cannot flip a tied partition label.
  let nx=-dy/size,ny=dx/size;if(nx<-.0001||Math.abs(nx)<.0001&&ny<0){nx=-nx;ny=-ny;}
  const distance=w.thickness/2+gap+Math.abs(nx)*halfWidth+Math.abs(ny)*halfHeight;
  const boundaryDistance=doc.floor.length>2?Math.min(...doc.floor.map((p,j)=>edgeDistance([cx,cy],p,doc.floor[(j+1)%doc.floor.length]))):Infinity;
  const outer=w.group==='outer'||boundaryDistance<=w.thickness/2+200;
  const candidates=[];
  for(let lane=0;lane<=doc.walls.length+2;lane++){for(const sign of [1,-1]){
   const extra=lane*(2*Math.max(halfWidth,halfHeight)+font*.5),offset=distance+extra;
   const x=cx+nx*offset*sign,y=cy+ny*offset*sign,box={left:x-halfWidth,right:x+halfWidth,top:y-halfHeight,bottom:y+halfHeight},isInside=inside([x,y],doc.floor);
   let score=lane*4000+(doc.floor.length>2?(outer?(isInside?3000:0):(isInside?0:3000)):0);
   for(const other of doc.walls){if(other.id===w.id||other.id.startsWith('wall_gap_'))continue;const clearance=edgeDistance([x,y],other.a,other.b)-other.thickness/2;if(clearance<Math.max(halfWidth,halfHeight)+font*.15)score+=100000;score+=font/Math.max(font,clearance);}
   for(const obstacle of [...doorBoxes,...dimensionBoxes,...openingBoxes,...heightBoxes])if(overlap(box,obstacle))score+=1000000;
   const collides=placed.some(obstacle=>overlap(box,{left:obstacle.left-font*.15,right:obstacle.right+font*.15,top:obstacle.top-font*.15,bottom:obstacle.bottom+font*.15}));
   candidates.push({id:w.id,number:i+1,x,y,cx,cy,nx:nx*sign,ny:ny*sign,outer,halfWidth,halfHeight,fontSize,gap:gap+extra,box,score,collides,leader:lane>0});
  }const free=candidates.filter(c=>!c.collides).sort((a,b)=>a.score-b.score)[0];if(free&&free.score<=(lane+1)*4000)break;}
  const best=candidates.filter(c=>!c.collides).sort((a,b)=>a.score-b.score)[0]||candidates.sort((a,b)=>a.score-b.score)[0];if(!w.id.startsWith('wall_gap_'))placed.push(best.box);return best;
 });
}
