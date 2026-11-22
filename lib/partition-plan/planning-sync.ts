import type {MeasureDoc,Wall} from '../measured-plan/measure-model';
import {fromMeasured,visiblePlan,demolitionReason,sourceWallId,type PartitionDoc,type PartitionOpening} from './model.ts';
const wallKey=(w:Wall)=>JSON.stringify([[...w.a],[...w.b]].sort((a,b)=>a[0]-b[0]||a[1]-b[1]))+':'+w.thickness;
/** The measured base remains immutable. Planning changes become construction operations. */
export function partitionFromPlanning(previous:PartitionDoc|null,base:MeasureDoc,target:MeasureDoc,revision:number,sheet:number):PartitionDoc{
 const doc=structuredClone(previous||fromMeasured(base,0));doc.baseLocked=true;
 const displayed=visiblePlan(doc,'installation'),unchanged=JSON.stringify(displayed.walls.map(wallKey).sort())===JSON.stringify(target.walls.map(wallKey).sort());
 const map=new Map<string,string>();
 if(unchanged){for(const w of target.walls){const match=displayed.walls.find(old=>wallKey(old)===wallKey(w));if(match)map.set(w.id,match.id);}}
 else{
  doc.removed=[];doc.removedRanges={};doc.added=[];
  const kept=new Set<string>();
  for(const w of target.walls){const old=doc.base.walls.find(b=>!kept.has(b.id)&&wallKey(b)===wallKey(w));if(old){kept.add(old.id);map.set(w.id,old.id);}else{let id=w.id;if(doc.base.walls.some(b=>b.id===id))id='planning_'+id;map.set(w.id,id);doc.added.push({...structuredClone(w),id,provenance:'Из текущего листа планировочного решения; параметры требуют проверки'});}}
  doc.removed=doc.base.walls.filter(w=>!kept.has(w.id)).map(w=>w.id);
 }
 const baseOpenings:PartitionOpening[]=[],openings:PartitionOpening[]=[];
 for(const o of target.openings){const wallId=map.get(o.wallId);if(!wallId)continue;const item={...structuredClone(o),wallId};if(doc.added.some(w=>w.id===wallId))openings.push({...item,id:doc.base.openings.some(old=>old.id===item.id)?'planning_'+item.id:item.id});else{const host=doc.base.walls.find(w=>w.id===sourceWallId(doc,wallId)),from=target.walls.find(w=>w.id===o.wallId);if(host&&from){const l=Math.hypot(from.b[0]-from.a[0],from.b[1]-from.a[1]),hl=Math.hypot(host.b[0]-host.a[0],host.b[1]-host.a[1]);const x=from.a[0]+(from.b[0]-from.a[0])*o.offset/l,y=from.a[1]+(from.b[1]-from.a[1])*o.offset/l;baseOpenings.push({...item,wallId:host.id,offset:((x-host.a[0])*(host.b[0]-host.a[0])+(y-host.a[1])*(host.b[1]-host.a[1]))/hl});}}}
 doc.openings=openings;
 const wallIds=new Set([...doc.base.walls,...doc.added].map(w=>w.id));doc.attributes=Object.fromEntries(Object.entries(doc.attributes).filter(([id])=>wallIds.has(id)));
 const pending=doc.removed.filter(id=>!!demolitionReason(doc,id));
 doc.planningSync={planId:target.id,revision,sheet,pending,baseOpenings,columns:structuredClone(target.columns||[])};
 return doc;
}
