import {pieceSize} from './tile-products.mjs';
/** Move the laying grid, leaving the covered wall area and its masks stationary. */
export function shiftWallPattern(group,dx,dy){return group.map(p=>({...p,x:p.x+dx,y:p.y+dy,grid:{...p.grid,origin:[p.grid.origin[0]+dx,p.grid.origin[1]+dy],phaseDrag:true}}));}
/** The Y axis is the same physical elevation on both sides of a room corner. */
export function adjacentJointHeights(context,nodes,wallId){
 const heights=[];
 for(const surface of context?.adjacent||[])for(const part of surface.parts){const id='wall_'+part.wallId;if(id===wallId)continue;for(const p of nodes[id]?.metadata?.roomDesignTiles||[]){if(p.side!==part.side)continue;const [w,h]=pieceSize(p),clip=p.clipBounds||[-Infinity,-Infinity,Infinity,Infinity];if(p.x+w<part.from/1000||p.x>part.to/1000||p.y+h<clip[1]||p.y>clip[3])continue;const y=p.y+h+p.joint/2;if(y>0&&y<nodes[id].height)heights.push(y);}}
 return [...new Set(heights.map(y=>Math.round(y*1e6)/1e6))];
}
export function alignWallPattern(group,heights,bounds,threshold=.018){
 let best=null;for(const p of group){const y=p.y+pieceSize(p)[1]+p.joint/2;if(y<bounds[1]||y>bounds[3])continue;for(const target of heights){const delta=target-y;if(Math.abs(delta)<(best?Math.abs(best.delta):threshold))best={delta,target};}}
 return {pieces:best?shiftWallPattern(group,0,best.delta):group,lines:best?[[bounds[0],best.target,bounds[2],best.target]]:[]};
}
/** Preserve individual decors of cells that remain visible after a grid shift. */
export function retainShiftedDecor(pieces,moved){const cells=new Map(moved.map(p=>[[p.x,p.y].map(n=>Math.round(n*1e6)).join(':'),p]));return pieces.map(p=>{const old=cells.get([p.x,p.y].map(n=>Math.round(n*1e6)).join(':'));return old?{...p,productId:old.productId,angle:old.angle}:p;});}
export function patternRecipe(pieces){const counts=new Map();for(const p of pieces){const key=p.productId+':'+p.angle;const entry=counts.get(key)||{piece:p,count:0};entry.count++;counts.set(key,entry);}return [...counts.values()].sort((a,b)=>b.count-a.count)[0]?.piece;}

/** Keep mounted cells stable when a moved pattern is regenerated. */
export function retainCellIds(pieces,previous){const ids=new Map(previous.filter(p=>p.grid).map(p=>[[p.grid.column,p.grid.row].join(':'),p.id]));return pieces.map(p=>({...p,id:ids.get([p.grid?.column,p.grid?.row].join(':'))||p.id}));}
