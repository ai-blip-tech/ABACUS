import clipping from 'polygon-clipping';import {tileOutline,polygonArea} from './tile-shape.mjs';
const box=r=>[[r[0],r[1]],[r[2],r[1]],[r[2],r[3]],[r[0],r[3]]];
export const shapedArea=ps=>ps.reduce((s,p)=>s+polygonArea(p[0])-p.slice(1).reduce((s,r)=>s+polygonArea(r),0),0);
export function shapedPolygons(product,piece,bounds,holes=[],inset=0){const r=piece.clipBounds||bounds,b=[Math.max(r[0],bounds[0]),Math.max(r[1],bounds[1]),Math.min(r[2],bounds[2]),Math.min(r[3],bounds[3])];if(b[2]<=b[0]||b[3]<=b[1])return[];let p=clipping.intersection([tileOutline(product,piece,inset)],[box(b)]);for(const h of [...holes,...piece.masks||[]])if(p.length)p=clipping.difference(p,[box(h)]);return p;}
