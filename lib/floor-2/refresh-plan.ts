import {sameWallGeometry} from '../planning-plan/opening-sync.ts';
import type {MeasureDoc} from '../measured-plan/measure-model';
import {detectedRooms} from '../measured-plan/measure-rooms.ts';
import {pointInside,regionFromRoom,type Floor2Region} from './model.ts';
/** Keep material/layout edits while adopting current structural geometry. */
export function refreshFloorPlan(current:MeasureDoc,latest:MeasureDoc):MeasureDoc{
 if(current.id!==latest.id)return structuredClone(latest);
 if(sameWallGeometry(current,latest))return {...structuredClone(latest),floorRegions:structuredClone(current.floorRegions||[])};
 const rooms=detectedRooms(latest),regions=current.floorRegions as Floor2Region[]||[];
 const matches=new Map(regions.map(r=>[r.id,r.roomLinked&&r.roomAnchor?rooms.find(room=>pointInside(r.roomAnchor!,room.polygon)):undefined]));
 return {...structuredClone(latest),floorRegions:regions.map(r=>{const room=matches.get(r.id);if(!room)return {...structuredClone(r),needsReview:true};
  // Removing a partition may merge rooms with different decorations. Keep their
  // existing zones rather than expanding both coverings over the entire room.
  if(regions.some(other=>other.id!==r.id&&matches.get(other.id)?.id===room.id))return {...structuredClone(r),needsReview:true};
  const boundary=regionFromRoom(latest,room,r.id);return {...structuredClone(r),polygon:boundary.polygon,roomAnchor:boundary.roomAnchor,needsReview:false};
 })};
}
