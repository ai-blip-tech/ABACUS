import type {MeasureDoc} from '../measured-plan/measure-model';
import {readAlbum,saveVariant,type PlanningAlbum} from '../planning-plan/variants.ts';
import {withManualSheets} from '../planning-plan/manual-workspace.ts';
export function floorGeometryKey(p:MeasureDoc){return JSON.stringify([p.walls.map(w=>[w.id,w.a,w.b,w.thickness]),p.openings.map(o=>[o.id,o.wallId,o.offset,o.width,o.kind]),p.columns,p.floor]);}
/** Merge only floor coverings into the newest album, preserving furniture, walls and other sheets. */
export function mergeFloorCoverings(value:PlanningAlbum,source:MeasureDoc){
 const album=readAlbum(value),current=album.variants.manual?.plan;if(!current||current.id!==source.id)throw Error('В планировочном решении выбран другой лист. Вернитесь к исходному листу перед изменением покрытия.');
 if(floorGeometryKey(current)!==floorGeometryKey(source))throw Error('Границы планировки изменились. Обновите границы напольного покрытия перед сохранением.');
 if(JSON.stringify(current.floorRegions||[])===JSON.stringify(source.floorRegions||[]))return album;
 return withManualSheets(saveVariant(album,'manual',{...current,floorRegions:structuredClone(source.floorRegions||[]),updatedAt:new Date().toISOString()},p=>p as MeasureDoc));
}
