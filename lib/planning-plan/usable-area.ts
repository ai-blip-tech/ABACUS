import clipping from 'polygon-clipping';
import type {MeasureDoc,Point,Wall} from '../measured-plan/measure-model';
import {wallBodies,wallJoins} from '../measured-plan/measure-display.ts';
type Multi=clipping.MultiPolygon;
export const ringArea=(p:Point[])=>Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2);
export const multiArea=(p:Multi)=>p.reduce((s,poly)=>s+ringArea(poly[0])-poly.slice(1).reduce((v,h)=>v+ringArea(h),0),0);
const round=(v:number)=>Math.round(v*1000)/1000;
export function unionRings(rings:Point[][]):Multi{const polys=rings.filter(p=>p.length>=3&&ringArea(p)>.001).map(p=>[p.map(v=>v.map(round) as Point)]);return polys.length?clipping.union(polys[0],...polys.slice(1)):[];}
export function wallRectangle(w:Wall,start=0,end=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])):Point[]{const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);if(l<.001||w.thickness<=0)return[];const ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l,h=w.thickness/2;return[[start,h],[end,h],[end,-h],[start,-h]].map(([x,y])=>[w.a[0]+ux*x-uy*y,w.a[1]+uy*x+ux*y]);}
export function openingRectangle(doc:MeasureDoc,o:MeasureDoc['openings'][number]){const w=doc.walls.find(w=>w.id===o.wallId);return w?wallRectangle(w,o.offset-o.width/2,o.offset+o.width/2):[];}
export function modelWallSolids(doc:MeasureDoc):Multi{
 const bodies=wallBodies(doc.walls),closed=unionRings([...bodies.map(w=>wallRectangle(w)),...wallJoins(bodies,0).map(j=>j.polygon)]);
 const doors=unionRings(doc.openings.filter(o=>o.kind==='door'||o.kind==='opening'&&o.sill===0).map(o=>openingRectangle(doc,o)));
 return closed.length&&doors.length?clipping.difference(closed,doors):closed;
}
/** Floor projection, not furniture clearance or an assertion of statutory area.
 * Doors contribute their floor threshold; windows/sills remain wall footprints.
 * Displayed area excludes wall/partition and column footprints exactly once.
 */
export function usablePlanArea(doc:MeasureDoc):{squareMetres:number|null;polygons:Multi;envelope:Multi;axisSquareMetres:number|null}{
 if(doc.floor.length<3)return{squareMetres:null,polygons:[],envelope:[],axisSquareMetres:null};
 const walls=modelWallSolids(doc),closed=unionRings([...wallBodies(doc.walls).map(w=>wallRectangle(w)),...wallJoins(wallBodies(doc.walls),0).map(j=>j.polygon),doc.floor]);
 const envelope:Multi=closed.map(p=>[p[0]]);
 const columns=unionRings((doc.columns||[]).filter(c=>c.width>0&&c.depth>0).map(c=>[c.a,[c.a[0]+c.width,c.a[1]],[c.a[0]+c.width,c.a[1]+c.depth],[c.a[0],c.a[1]+c.depth]]));
 let polygons=envelope;if(walls.length)polygons=clipping.difference(polygons,walls);if(columns.length)polygons=clipping.difference(polygons,columns);
 return{squareMetres:multiArea(polygons)/1e6,polygons,envelope,axisSquareMetres:ringArea(doc.floor)/1e6};
}
