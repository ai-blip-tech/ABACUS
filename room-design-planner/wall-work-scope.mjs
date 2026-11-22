let context=null,selectedRoomSurface=null;
export const getWallWork=()=>context;
export const setWallWork=value=>{context=value;};
export const setRoomFinishSurface=value=>{selectedRoomSurface=value;};
export const getFinishSurface=()=>context?.surface||selectedRoomSurface;
export function workPart(wallId,side){return getFinishSurface()?.parts.find(p=>'wall_'+p.wallId===wallId&&p.side===side);}
export function workBounds(wall,side){const L=Math.hypot(wall.end[0]-wall.start[0],wall.end[1]-wall.start[1]);if(!getFinishSurface())return[0,0,L,wall.height];const p=workPart(wall.id,side);return p?[p.from/1000,0,p.to/1000,wall.height]:null;}
export function clampWorkBounds(wall,side,bounds){const limit=workBounds(wall,side);if(!limit)return null;const b=[Math.max(limit[0],bounds[0]),Math.max(limit[1],bounds[1]),Math.min(limit[2],bounds[2]),Math.min(limit[3],bounds[3])];return b[2]-b[0]>.001&&b[3]-b[1]>.001?b:null;}
