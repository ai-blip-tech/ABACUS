import {uuid,type MeasureDoc,type Wall,type Opening,type Point} from './measure-model.ts';
import {freeOpeningOffset,moveOpening} from './measure-editing.ts';
export type PlanClipboard={kind:'wall',wall:Wall,openings:Opening[]}|{kind:'opening',opening:Opening};
export function copyPlanItem(doc:MeasureDoc,wallId:string,openingId=''):PlanClipboard{
 if(openingId){const opening=doc.openings.find(o=>o.id===openingId);if(!opening)throw Error('Выберите дверь, окно или проём');return {kind:'opening',opening:structuredClone(opening)};}
 const wall=doc.walls.find(w=>w.id===wallId);if(!wall)throw Error('Сначала выберите стену, дверь, окно или проём');
 return {kind:'wall',wall:structuredClone(wall),openings:structuredClone(doc.openings.filter(o=>o.wallId===wallId))};
}
export function pastePlanItem(doc:MeasureDoc,clip:PlanClipboard,targetWallId:string,count=1,id=uuid){
 if(clip.kind==='wall'){
  const w=clip.wall,l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);if(l<100)throw Error('Нельзя скопировать стену с некорректной длиной');
  const step=Math.max(300,w.thickness+100)*count,dx=-(w.b[1]-w.a[1])/l*step,dy=(w.b[0]-w.a[0])/l*step;
  const wall:Wall={...structuredClone(w),id:'wall_measure_'+id().replaceAll('-',''),name:w.name.replace(/ · копия.*$/,'')+' · копия',a:[w.a[0]+dx,w.a[1]+dy] as Point,b:[w.b[0]+dx,w.b[1]+dy] as Point,provenance:'Копия стены; положение нужно проверить'};
  const openings=clip.openings.map(o=>({...structuredClone(o),id:o.kind+'_measure_'+id().replaceAll('-',''),wallId:wall.id,confirmed:false}));
  return {doc:{...doc,walls:[...doc.walls,wall],openings:[...doc.openings,...openings],geometryReviewed:false,conflictNotes:{}},wallId:wall.id,openingId:''};
 }
 const host=doc.walls.find(w=>w.id===targetWallId);if(!host)throw Error('Выберите стену, на которую нужно вставить проём');
 const source=clip.opening,wallHeight=host.height??doc.height;
 if(wallHeight&&source.height&&source.height+(source.kind==='window'?source.sill||0:0)>wallHeight)throw Error('Скопированный проём по высоте не помещается в выбранной стене');
 const offset=freeOpeningOffset(doc,host,source.width),opening:Opening={...structuredClone(source),id:source.kind+'_measure_'+id().replaceAll('-',''),wallId:host.id,offset,confirmed:false};
 let next={...doc,openings:[...doc.openings,opening],geometryReviewed:false};
 try{next=moveOpening(next,opening.id,source.offset+(source.width+100)*count);}catch{/* Keep the verified free interval when the preferred place is occupied. */}
 return {doc:next,wallId:host.id,openingId:opening.id};
}
