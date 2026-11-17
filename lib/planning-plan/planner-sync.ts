import {readPlannerWallFinish} from './wall-finishes.ts';
import {validateFloorRegions} from '../measured-plan/measure-floor-finishes.ts';
import type {MeasureDoc,Point,Wall,Opening,Column} from '../measured-plan/measure-model';
import {furnitureTemplates,newFurniture,type FurnitureItem,type FurnitureKind} from './furniture.ts';
import {withAutomaticFloor} from '../measured-plan/measure-auto-floor.ts';
export type PlannerScene={nodes:Record<string,any>;rootNodeIds:string[];[key:string]:unknown};
export const planFingerprint=(plan:MeasureDoc)=>JSON.stringify({...plan,updatedAt:''});
const mm=(n:unknown)=>{if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>200)throw Error('Некорректный размер или координата в 3D');return Math.round(n*1000*1000)/1000;};
const point=(p:any):Point=>{if(!Array.isArray(p)||p.length<2)throw Error('Некорректная точка в 3D');return[mm(p[0]),mm(p[1])];};
const closeValue=(a:any,b:any):boolean=>typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<.00001:Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>closeValue(v,b[i])):a===b;
const unchanged=(node:any,baseline:any)=>{if(!baseline)return false;const keys=node.type==='wall'?['start','end','thickness','height']:node.type==='door'||node.type==='window'?['position','width','height','hingesSide','swingDirection','openingKind']:['position','rotation','scale'];return keys.every(k=>closeValue(node[k],baseline[k]))&&(node.type!=='item'||closeValue(node.asset?.dimensions,baseline.asset?.dimensions));};
const same=(a:number,b:number)=>Math.abs(a-b)<.001;
const derived=(current:number,initial:number|undefined,original:number|null)=>initial!==undefined&&same(current,initial)?original:current;
const idFor=(node:any,existing:Set<string>,used:Set<string>,prefix:string)=>{const saved=node.metadata?.roomDesignId;let id=typeof saved==='string'&&existing.has(saved)&&!used.has(saved)?saved:prefix+'_'+node.id.replace(/[^a-zA-Z0-9_-]/g,'').slice(-105);if(used.has(id))throw Error('Повторяющийся объект в 3D');used.add(id);return id;};
export function planningFromPlanner(source:MeasureDoc,scene:PlannerScene,baseline:PlannerScene):MeasureDoc{
 if(!scene?.nodes||!Array.isArray(scene.rootNodeIds)||Object.keys(scene.nodes).length>4000||!scene.nodes.level_roomdesign||!scene.nodes.site_roomdesign)throw Error('Получена некорректная сцена Room Design Planner');
 const level=scene.nodes.level_roomdesign;if(Object.values(scene.nodes).filter((n:any)=>n.type==='level').length!==1)throw Error('Сейчас синхронизируется только один этаж');
 for(const node of Object.values(scene.nodes) as any[])if(['site','building','level'].includes(node.type)&&((node.rotation||[]).some((n:number)=>Math.abs(n)>.000001)||(node.position||[]).some((n:number)=>Math.abs(n)>.000001)))throw Error('Сначала верните положение этажа: перенос всей системы координат пока не поддерживается');
 const next=structuredClone(source),walls:Wall[]=[],openings:Opening[]=[],columns:Column[]=[],furniture:FurnitureItem[]=[];
 const wallIds=new Map<string,string>(),usedWalls=new Set<string>(),oldWallIds=new Set(source.walls.map(w=>w.id));
 for(const node of Object.values(scene.nodes) as any[])if(node.type==='wall'){
  if(node.parentId!==level.id)throw Error('Стены другого уровня не поддерживаются');const id=idFor(node,oldWallIds,usedWalls,'wall_pascal'),old=source.walls.find(w=>w.id===id),initial=baseline.nodes[node.id];const a=point(node.start),b=point(node.end),thickness=mm(node.thickness),height=mm(node.height);if(thickness<50||thickness>1500||Math.hypot(b[0]-a[0],b[1]-a[1])<1)throw Error('Проверьте размеры стены в 3D');wallIds.set(node.id,id);
  const finish = readPlannerWallFinish(node.metadata || {});
  const retained = Object.keys(finish).length || old?.plannerFinish !== undefined ? {plannerFinish:finish} : {};
  if(old&&unchanged(node,initial)){walls.push({...structuredClone(old),...retained});continue;}
  walls.push({...old,...retained,id,name:node.name||old?.name||'Стена',a,b,thickness,height:derived(height,initial?mm(initial.height):undefined,old?.height??null),group:old?.group||'inner',lengthConfirmed:old?.lengthConfirmed??true,thicknessConfirmed:old?.thicknessConfirmed??true,provenance:old?.provenance||'Создано пользователем в Room Design Planner'});
 }
 const usedOpenings=new Set<string>(),oldOpenings=new Set(source.openings.map(o=>o.id));
 for(const node of Object.values(scene.nodes) as any[])if(node.type==='door'||node.type==='window'){
  const wallId=wallIds.get(node.wallId||node.parentId);if(!wallId)throw Error('Проём в 3D не привязан к стене');const id=idFor(node,oldOpenings,usedOpenings,'opening_pascal'),old=source.openings.find(o=>o.id===id),initial=baseline.nodes[node.id],height=mm(node.height),sill=Math.max(0,mm(node.position[1])-height/2),width=mm(node.width),offset=mm(node.position[0]);if(width<100||height<100)throw Error('Проверьте размеры проёма в 3D');
  if(old&&unchanged(node,initial)){openings.push(structuredClone(old));continue;}
  openings.push({...old,id,wallId,kind:old?.kind||(node.type==='window'?'window':node.openingKind==='opening'?'opening':'door'),offset,width,height:derived(height,initial?mm(initial.height):undefined,old?.height??null),sill:node.type==='window'?derived(sill,initial?Math.max(0,mm(initial.position[1])-mm(initial.height)/2):undefined,old?.sill??null):old?.sill??0,hingesSide:node.hingesSide||old?.hingesSide||'left',swingDirection:node.swingDirection||old?.swingDirection||'inward',confirmed:old?.confirmed??false});
 }
 const usedFurniture=new Set<string>(),oldFurniture=new Set((source.furniture||[]).map(f=>f.id)),usedColumns=new Set<string>(),oldColumns=new Set((source.columns||[]).map(c=>c.id));
 for(const node of Object.values(scene.nodes) as any[])if(node.type==='item'){
  if(node.parentId!==level.id)throw Error('Для синхронизации поставьте мебель непосредственно на этаж, без вложенных групп');if((node.rotation||[]).some((n:number,i:number)=>i!==1&&Math.abs(n)>.00001))throw Error('Наклонённый предмет нельзя перенести в плоский план');
  const d=node.asset?.dimensions,s=node.scale;if(!d||!s)throw Error('Нет габаритов предмета в 3D');const size=d.map((n:number,i:number)=>mm(n*s[i]));if(size.some((n:number)=>n<10||n>20000))throw Error('Габариты предмета вне допустимого диапазона');const position:Point=[mm(node.position[0]),mm(node.position[2])];
  if(node.metadata?.column){if((node.rotation||[]).some((n:number)=>Math.abs(n)>.00001))throw Error('Поворот колонны пока не переносится в 2D');const id=idFor(node,oldColumns,usedColumns,'column_pascal'),old=source.columns?.find(c=>c.id===id),initial=baseline.nodes[node.id];if(old&&unchanged(node,initial)){columns.push(structuredClone(old));continue;}columns.push({...old,id,name:node.name||old?.name||'Колонна',a:[position[0]-size[0]/2,position[1]-size[2]/2],width:size[0],depth:size[2],height:derived(size[1],initial?mm(initial.asset.dimensions[1]*initial.scale[1]):undefined,old?.height??null),confirmed:old?.confirmed??false,structuralStatus:old?.structuralStatus||'unknown',provenance:old?.provenance||'Создано в Room Design Planner'});continue;}
  const id=idFor(node,oldFurniture,usedFurniture,'furniture_pascal'),old=source.furniture?.find(f=>f.id===id),initial=baseline.nodes[node.id],candidate=node.metadata?.kind||node.asset?.category,kind: FurnitureKind=furnitureTemplates.some(f=>f.kind===candidate)?candidate:'decor';
  const savedFurniture=node.metadata?.roomDesignFurniture;const item=old||{...newFurniture(kind,position),...(savedFurniture||{}),id};const rotation=(-(node.rotation?.[1]||0)*180/Math.PI%360+360)%360;
  if(old&&unchanged(node,initial)&&closeValue(node.metadata?.modularCabinet,initial?.metadata?.modularCabinet)){furniture.push(structuredClone(old));continue;}
  furniture.push({...item,...(node.metadata?.modularCabinet?{modularCabinet:structuredClone(node.metadata.modularCabinet)}:{}),id,name:node.name||item.name,position,width:size[0],depth:size[2],height:derived(size[1],initial?mm(initial.asset.dimensions[1]*initial.scale[1]):undefined,old?.height??null),rotation:old&&same(rotation,(old.rotation%360+360)%360)?old.rotation:rotation});
 }
 next.walls=walls;next.openings=openings;if(source.columns!==undefined||columns.length)next.columns=columns;if(source.furniture!==undefined||furniture.length)next.furniture=furniture;
 const initialHeight=baseline.nodes.level_roomdesign?.height;next.height=derived(mm(level.height),initialHeight===undefined?undefined:mm(initialHeight),source.height);
 const slab=scene.nodes.slab_roomdesign;if(Array.isArray(slab?.metadata?.roomDesignFloorRegions)&&(source.floorRegions!==undefined||slab.metadata.roomDesignFloorRegions.length))next.floorRegions=validateFloorRegions(slab.metadata.roomDesignFloorRegions);if(slab?.polygon?.length>=3&&!closeValue(slab.polygon,baseline.nodes.slab_roomdesign?.polygon))next.floor=slab.polygon.map(point);
 if(planFingerprint(next)===planFingerprint(source))return source;
 next.geometryReviewed=false;next.updatedAt=new Date().toISOString();return JSON.stringify([next.walls,next.columns])===JSON.stringify([source.walls,source.columns])?next:withAutomaticFloor(next,source);
}
