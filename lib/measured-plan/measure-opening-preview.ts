import type {MeasureDoc,Point} from './measure-model.ts';
import {openingAt,openingInGap} from './measure-opening-placement.ts';
import {projectOnWall} from './measure-editing.ts';
import {alignOpening} from './measure-opening-alignment.ts';

/** The same candidate is used for hover and commit; preview never mutates its source. */
export function openingPlacementAt(doc:MeasureDoc,p:Point,kind:'door'|'window',id:string,tolerance=150,wallId?:string,alignmentTolerance=60){
 const candidates=doc.walls.flatMap(w=>{const size=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);if(size<1)return[];const along=projectOnWall(w,p);if(along < -tolerance||along>size+tolerance)return[];const t=Math.max(0,Math.min(size,along)),q:Point=[w.a[0]+(w.b[0]-w.a[0])/size*t,w.a[1]+(w.b[1]-w.a[1])/size*t],distance=Math.hypot(p[0]-q[0],p[1]-q[1]);return distance<=w.thickness/2+tolerance?[{wall:w,distance}]:[];}).sort((a,b)=>Number(b.wall.id===wallId)-Number(a.wall.id===wallId)||a.distance-b.distance);
 const result=candidates.length?openingAt(doc,candidates[0].wall.id,p,kind,id):openingInGap(doc,p,kind,id,tolerance);
 const alignment=alignOpening(result.doc,result.opening,result.opening.offset,alignmentTolerance);
 result.opening.offset=alignment.offset;
 return{...result,guides:alignment.guides};
}
