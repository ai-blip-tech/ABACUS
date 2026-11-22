import {tileDragGroup} from './tile-drag.mjs';
import {fillRegion} from './tile-wall-fill.mjs';
import {patternRecipe} from './wall-pattern-phase.mjs';
import {pieceSize,tileProduct} from './tile-products.mjs';
import {tileShape} from '../lib/tile-shape.mjs';

export function selectedTileStyle(all,id,fallback={joint:.002,grout:'#c7c1b3'}){
 const piece=all.find(tile=>tile.id===id);
 return piece?{joint:piece.joint,grout:piece.grout}:fallback;
}

function changeGroupJoints(all,group,mode,style,length,height,holes){
 const first=group[0];
 if(!first)return {pieces:all};
 const ids=new Set(group.map(tile=>tile.id));
 let pieces=group.map(tile=>({...tile,...style}));
 let report;
 if(mode!=='tile'&&first.grid&&group.some(tile=>tile.joint!==style.joint)){
  const recipe=patternRecipe(group),[width,depth]=pieceSize(recipe),origin=first.grid.origin;
  const region=first.grid.region||first.clipBounds||[0,0,length,height];
  const shaped=tileShape(tileProduct(recipe.productId));
  const cellKey=(column,row)=>column+':'+row;
  const previous=new Map(group.map(tile=>[cellKey(tile.grid.column,tile.grid.row),tile]));
  const result=fillRegion(length,height,first.side,{productId:recipe.productId,angle:recipe.angle,origin,...style},[...holes,...(first.masks||[])],region);
  report={count:result.pieces.length,cut:result.cut,candidates:result.candidates};
  pieces=result.pieces.map(tile=>{
   const column=shaped?tile.grid.column:Math.round((tile.x-origin[0])/(width+style.joint));
   const row=shaped?tile.grid.row:Math.round((tile.y-origin[1])/(depth+style.joint));
   const old=previous.get(cellKey(column,row));
   return {...tile,id:old?.id||tile.id,productId:old?.productId||tile.productId,angle:old?.angle??tile.angle,masks:first.masks,
    grid:{...tile.grid,column,row,origin,groupId:first.grid.groupId||tile.grid.groupId,freeFill:first.grid.freeFill}};
  });
 }
 return {pieces:all.flatMap(tile=>tile.id===first.id?pieces:ids.has(tile.id)?[]:[tile]),report,side:first.side};
}

export function changeSelectedTileJoints(all,id,mode,style,length,height,holes=[]){
 const selected=all.find(tile=>tile.id===id);
 return selected?changeGroupJoints(all,tileDragGroup(selected,all,mode),mode,style,length,height,holes).pieces:all;
}

export function changeAppliedTileJoints(all,groupId,style,length,height,holes=[]){
 return changeGroupJoints(all,all.filter(tile=>tile.grid?.groupId===groupId),'area',style,length,height,holes);
}
