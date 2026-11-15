import clipping from 'polygon-clipping';
import {floorRegionGeometry,type FloorRegion} from './measure-floor-finishes.ts';
import {multiArea} from '../planning-plan/usable-area.ts';
import type {MeasureDoc,Point} from './measure-model';
/** Count intersected stock slabs on the actual grid; offcuts are not reused. */
export function floorTileQuantity(plan:MeasureDoc,region:FloorRegion){
 const tile=region.material==='tile'?region.tile:null;if(!tile)return null;const polygons=floorRegionGeometry(plan,region).polygons,rad=(region.angle||0)*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),[ox,oy]=region.origin||[0,0];
 const local=(p:number[])=>[(p[0]-ox)*c+(p[1]-oy)*s,-(p[0]-ox)*s+(p[1]-oy)*c] as Point;
 const shape=polygons.map(poly=>poly.map(r=>r.map(local))),points=shape.flat(2);if(!points.length)return{count:0,cut:0,stockArea:0,tileArea:0};
 const dx=tile.widthMm+tile.jointMm,dy=tile.heightMm+tile.jointMm,x0=Math.floor(Math.min(...points.map(p=>p[0]))/dx),x1=Math.floor(Math.max(...points.map(p=>p[0]))/dx),y0=Math.floor(Math.min(...points.map(p=>p[1]))/dy),y1=Math.floor(Math.max(...points.map(p=>p[1]))/dy);
 if((x1-x0+1)*(y1-y0+1)>100000)throw Error('Слишком много плит для расчёта. Уточните формат');let count=0,cut=0,tileArea=0;
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const a=x*dx,b=y*dy,area=multiArea(clipping.intersection(shape,[[[a,b],[a+tile.widthMm,b],[a+tile.widthMm,b+tile.heightMm],[a,b+tile.heightMm]]]));if(area>.1){count++;tileArea+=area/1e6;if(area<tile.widthMm*tile.heightMm-1)cut++;}}
 return{count,cut,stockArea:count*tile.widthMm*tile.heightMm/1e6,tileArea};
}
