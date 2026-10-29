import clipping from 'polygon-clipping';
import type {DxfScene,DxfPreview,DxfUnit} from './dxf-import';
import {dxfUnits} from './dxf-import.ts';
import {unionRings,multiArea,openingRectangle,usablePlanArea,modelWallSolids,ringArea} from './usable-area.ts';
import type {Point} from '../measured-plan/measure-model';
export type DxfAudit={version:1;sourceOuterM2:number|null;importOuterM2:number|null;sourceUsableM2:number|null;importUsableM2:number|null;axisM2:number|null;outerDeltaM2:number|null;usableDeltaM2:number|null;wallXorM2:number|null;maxFaceErrorMm:number|null;sourceWallBlocks:number;importWalls:number;furnitureBlocks:number;importFurniture:number;notes:string[]};
/** Source areas use original HATCH boundaries, not reconstructed wall axes. */
export function auditDxf(scene:DxfScene,preview:DxfPreview,unit:DxfUnit):DxfAudit{
 const factor=dxfUnits[unit].factor,plan=preview.plan,areas=usablePlanArea(plan),convert=(p:Point):Point=>[(p[0]-preview.origin[0])*factor,(preview.origin[1]-p[1])*factor];
 const fills=scene.paths.filter(p=>p.semantic==='wall'&&p.fill).map(p=>p.points.map(convert)),sourceSolid=unionRings(fills),notes:string[]=[];
 let sourceOuterM2:number|null=null,sourceUsableM2:number|null=null,outerDeltaM2:number|null=null,usableDeltaM2:number|null=null,wallXorM2:number|null=null;
 const importOuterM2=areas.envelope.length?multiArea(areas.envelope)/1e6:null;
 if(sourceSolid.length){
  // Temporary gap closures reconstruct the envelope only. Door thresholds are
  // then restored to usable floor; windows remain occupied by wall/sill.
  const closures=unionRings(plan.openings.map(o=>openingRectangle(plan,o))),closed=closures.length?clipping.union(sourceSolid,closures):sourceSolid;
  const largest=[...closed].sort((a,b)=>ringArea(b[0])-ringArea(a[0]))[0];
  if(largest&&largest.length>1){const envelope:clipping.MultiPolygon=[[largest[0]]],windows=unionRings(plan.openings.filter(o=>o.kind==='window').map(o=>openingRectangle(plan,o))),sourceWalls=windows.length?clipping.union(sourceSolid,windows):sourceSolid;
   sourceOuterM2=multiArea(envelope)/1e6;sourceUsableM2=multiArea(clipping.difference(envelope,sourceWalls))/1e6;
   const columns=unionRings((plan.columns||[]).map(c=>[c.a,[c.a[0]+c.width,c.a[1]],[c.a[0]+c.width,c.a[1]+c.depth],[c.a[0],c.a[1]+c.depth]]));if(columns.length)sourceUsableM2=multiArea(clipping.difference(clipping.difference(envelope,sourceWalls),columns))/1e6;
   wallXorM2=multiArea(clipping.xor(sourceWalls,modelWallSolids(plan)))/1e6;
   outerDeltaM2=importOuterM2===null?null:importOuterM2-sourceOuterM2;usableDeltaM2=areas.squareMetres===null?null:areas.squareMetres-sourceUsableM2;
  }else notes.push('По HATCH не найден единственный замкнутый внешний контур. Площадь DXF не подтверждена.');
 }else notes.push('В DXF нет поддерживаемых заливок стен: независимая сверка площади по HATCH недоступна.');
 let maxFaceErrorMm:number|null=null;
 for(const w of plan.walls){const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l;for(const p of scene.paths.filter(p=>p.block===w.name&&p.semantic==='wall'&&!p.fill&&!p.curved)){for(let i=1;i<p.points.length;i++){const a=convert(p.points[i-1]),b=convert(p.points[i]),sl=Math.hypot(b[0]-a[0],b[1]-a[1]);if(sl<1||Math.abs((b[0]-a[0])*-uy+(b[1]-a[1])*ux)>sl*.002)continue;for(const q of [a,b]){const error=Math.abs(Math.abs((q[0]-w.a[0])*-uy+(q[1]-w.a[1])*ux)-w.thickness/2);maxFaceErrorMm=Math.max(maxFaceErrorMm??0,error);}}}}
 notes.push('Площади рассчитаны по геометрии DXF, а не сравнены с утверждённой экспликацией Archicad. Дверные пороги включены, стены под окнами исключены.');
 if(wallXorM2!==null&&wallXorM2>.000001)notes.push('Есть отличие исходных контуров от прямоугольной модели стен. Полное геометрическое тождество не подтверждено.');
 return{version:1,sourceOuterM2,importOuterM2,sourceUsableM2,importUsableM2:areas.squareMetres,axisM2:areas.axisSquareMetres,outerDeltaM2,usableDeltaM2,wallXorM2,maxFaceErrorMm,sourceWallBlocks:scene.instances.filter(i=>i.semantic==='wall').length,importWalls:plan.walls.length,furnitureBlocks:scene.instances.filter(i=>!i.semantic&&scene.paths.some(p=>p.instance===i.id)).length,importFurniture:plan.furniture?.length||0,notes};
}
