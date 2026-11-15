import {optimizeTileGrid} from '../tile-grid-optimizer.mjs';
import {floorRegionGeometry,type FloorRegion} from './measure-floor-finishes.ts';
import type {MeasureDoc} from './measure-model';
export function optimizeFloorTile(plan:MeasureDoc,region:FloorRegion):FloorRegion{if(region.material!=='tile'||!region.tile)return region;const tile=region.tile,result=optimizeTileGrid({polygons:floorRegionGeometry({...plan,floorRegions:(plan.floorRegions||[]).map(r=>r.id===region.id?region:r)},region).polygons,width:tile.widthMm,height:tile.heightMm,joint:tile.jointMm,origin:region.origin||[0,0],angle:region.angle||0});return{...region,origin:result.origin as [number,number],angle:result.angle,tileLayoutMode:'auto'};}
export function refreshAutoTileFloors(plan:MeasureDoc){return{...plan,floorRegions:plan.floorRegions?.map(r=>r.material==='tile'&&r.tileLayoutMode!=='manual'?optimizeFloorTile(plan,r):r)};}
