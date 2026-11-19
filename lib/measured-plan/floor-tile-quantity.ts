import {evaluateTileGrid} from '../tile-grid-optimizer.mjs';
import {floorRegionGeometry,type FloorRegion} from './measure-floor-finishes.ts';
import type {MeasureDoc} from './measure-model';
/** Count stock slabs on the same grid used for optimization; offcuts are not reused. */
export function floorTileQuantity(plan:MeasureDoc,region:FloorRegion){
 const tile=region.material==='tile'?region.tile:null;if(!tile)return null;
 const score=evaluateTileGrid(floorRegionGeometry(plan,region).polygons,tile.widthMm,tile.heightMm,tile.jointMm,region.origin||[0,0],region.angle||0);
 return{count:score.count,cut:score.cut,stockArea:score.count*tile.widthMm*tile.heightMm/1e6,tileArea:score.tileArea/1e6};
}
