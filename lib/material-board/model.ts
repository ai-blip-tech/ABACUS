import {isInteriorWorkspace,type InteriorWorkspace} from './interior-workspace.ts';
export type BoardPoint={x:number;y:number};
export type BoardView=BoardPoint&{scale:number};
export type MaterialNode={id:string;kind:'reference'|'material'|'colour'|'note'|'product';x:number;y:number;width:number;height:number;title:string;interior?:InteriorWorkspace;image?:string;originalImage?:string;generated?:boolean;trayOnly?:boolean;trayOrder?:number;scene?:boolean;editPoint?:BoardPoint;editAction?:'replace'|'add'|'material';resultType?:'interior-render'|'material-variant'|'moodboard'|'planogram-3d'|'kitchen-concept';sourceCount?:number;colour?:string;pattern?:string;code?:string;text?:string;catalogId?:string;brand?:string;materialId?:string;widthMm?:number|null;depthMm?:number|null;heightMm?:number|null};
export type MaterialLink={id:string;from:string;to:string};
export type MaterialGroup={id:string;title:string;members:string[]};
export type MaterialBoard={version:1;furniturePosition?:BoardPoint;nodes:MaterialNode[];links:MaterialLink[];groups:MaterialGroup[]};
export const emptyBoard=():MaterialBoard=>({version:1,nodes:[],links:[],groups:[]});
export const worldPoint=(p:BoardPoint,view:BoardView):BoardPoint=>({x:(p.x-view.x)/view.scale,y:(p.y-view.y)/view.scale});
export function zoomAt(view:BoardView,point:BoardPoint,scale:number):BoardView{const s=Math.min(2.5,Math.max(.25,scale)),p=worldPoint(point,view);return{x:point.x-p.x*s,y:point.y-p.y*s,scale:s};}
export function connectNodes(board:MaterialBoard,from:string,to:string,id:string):MaterialBoard{
 if(from===to||![from,to].every(id=>board.nodes.some(n=>n.id===id))||board.links.some(l=>l.from===from&&l.to===to||l.from===to&&l.to===from))return board;
 return{...board,links:[...board.links,{id,from,to}]};
}
export function removeNodes(board:MaterialBoard,ids:string[]):MaterialBoard{const removed=new Set(ids);return{...board,nodes:board.nodes.filter(n=>!removed.has(n.id)).map(n=>removed.has(n.materialId||'')?{...n,materialId:undefined}:n),links:board.links.filter(l=>!removed.has(l.from)&&!removed.has(l.to)),groups:board.groups.map(g=>({...g,members:g.members.filter(id=>!removed.has(id))})).filter(g=>g.members.length>1)};}
export function nodeBounds(nodes:MaterialNode[],padding=0){if(!nodes.length)return null;const x=Math.min(...nodes.map(n=>n.x))-padding,y=Math.min(...nodes.map(n=>n.y))-padding;return{x,y,width:Math.max(...nodes.map(n=>n.x+n.width))-x+padding,height:Math.max(...nodes.map(n=>n.y+n.height))-y+padding};}
export function fitBoard(nodes:MaterialNode[],width:number,height:number):BoardView{const box=nodeBounds(nodes,70);if(!box)return{x:0,y:0,scale:1};const scale=Math.min(1.2,Math.max(.25,Math.min(width/box.width,height/box.height)));return{x:(width-box.width*scale)/2-box.x*scale,y:(height-box.height*scale)/2-box.y*scale,scale};}
export function moveNodes(board:MaterialBoard,ids:string[],dx:number,dy:number):MaterialBoard{const selected=new Set(ids);return{...board,nodes:board.nodes.map(n=>selected.has(n.id)?{...n,x:n.x+dx,y:n.y+dy}:n)};}
export function findOverlappingNode<T extends {id:string;x:number;y:number;width:number;height:number}>(source:T,candidates:T[],point:BoardPoint):T|undefined{
 const sourceCenter={x:source.x+source.width/2,y:source.y+source.height/2};
 return candidates.map(candidate=>{
  const overlapWidth=Math.max(0,Math.min(source.x+source.width,candidate.x+candidate.width)-Math.max(source.x,candidate.x));
  const overlapHeight=Math.max(0,Math.min(source.y+source.height,candidate.y+candidate.height)-Math.max(source.y,candidate.y));
  const overlap=overlapWidth*overlapHeight,pointInside=point.x>=candidate.x&&point.x<=candidate.x+candidate.width&&point.y>=candidate.y&&point.y<=candidate.y+candidate.height;
  const candidateCenter={x:candidate.x+candidate.width/2,y:candidate.y+candidate.height/2},distance=Math.hypot(sourceCenter.x-candidateCenter.x,sourceCenter.y-candidateCenter.y);
  return{candidate,eligible:pointInside||overlap>0,score:(pointInside?100000:0)+overlap/Math.max(1,candidate.width*candidate.height)*10000-distance};
 }).filter(result=>result.eligible).sort((a,b)=>b.score-a.score)[0]?.candidate;
}
export function isMaterialTransferTarget(node:MaterialNode):boolean{return node.kind==='product'||node.kind==='reference'&&Boolean(node.image||node.originalImage)&&!node.scene&&!node.interior&&!node.trayOnly;}
export function duplicateNodes(board:MaterialBoard,ids:string[],uuid:()=>string){const chosen=board.nodes.filter(n=>ids.includes(n.id)),mapping=new Map(chosen.map(n=>[n.id,uuid()]));return{board:{...board,nodes:[...board.nodes,...chosen.map(n=>({...n,id:mapping.get(n.id)!,x:n.x+40,y:n.y+40,materialId:mapping.get(n.materialId||'')||n.materialId}))],links:[...board.links,...board.links.filter(l=>mapping.has(l.from)&&mapping.has(l.to)).map(l=>({id:uuid(),from:mapping.get(l.from)!,to:mapping.get(l.to)!}))]},ids:[...mapping.values()]};}
export function isBoard(value:unknown):value is MaterialBoard{
 if(!value||typeof value!=='object')return false;const b=value as MaterialBoard;
 if(!Array.isArray(b.nodes)||b.nodes.some(n=>!n||typeof n!=='object')||!Array.isArray(b.links)||b.links.some(l=>!l||typeof l!=='object')||!Array.isArray(b.groups)||b.groups.some(g=>!g||typeof g!=='object'))return false;
 const validImage=(image?:string)=>!image||/^(data:image\/(png|jpeg|webp);base64,|https?:\/\/|\/api\/projects\/[a-zA-Z0-9-]{1,100}\/assets\/[a-zA-Z0-9-]{1,100}$)/.test(image);
 const validDimension=(dimension?:number|null)=>dimension===undefined||dimension===null||Number.isFinite(dimension)&&dimension>0&&dimension<=100000;
 return b.version===1&&(b.furniturePosition===undefined||b.furniturePosition!==null&&typeof b.furniturePosition==='object'&&[b.furniturePosition.x,b.furniturePosition.y].every(Number.isFinite))&&Array.isArray(b.nodes)&&b.nodes.length<=100&&new Set(b.nodes.map(n=>n.id)).size===b.nodes.length&&b.nodes.every(n=>typeof n.id==='string'&&['reference','material','colour','note','product'].includes(n.kind)&&[n.x,n.y,n.width,n.height].every(Number.isFinite)&&n.width>=80&&n.width<=(n.interior?4000:1000)&&n.height>=80&&n.height<=(n.interior?4000:1000)&&(n.interior===undefined||isInteriorWorkspace(n.interior))&&typeof n.title==='string'&&(n.scene===undefined||typeof n.scene==='boolean')&&(n.editPoint===undefined||n.editPoint!==null&&typeof n.editPoint==='object'&&[n.editPoint.x,n.editPoint.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100))&&(n.editAction===undefined||['replace','add','material'].includes(n.editAction))&&(n.trayOnly===undefined||typeof n.trayOnly==='boolean')&&(n.trayOrder===undefined||Number.isFinite(n.trayOrder))&&(n.resultType===undefined||['interior-render','material-variant','moodboard','planogram-3d','kitchen-concept'].includes(n.resultType))&&(n.sourceCount===undefined||Number.isInteger(n.sourceCount)&&n.sourceCount>=0&&n.sourceCount<=16)&&validImage(n.image)&&validImage(n.originalImage)&&validDimension(n.widthMm)&&validDimension(n.depthMm)&&validDimension(n.heightMm))&&Array.isArray(b.links)&&b.links.length<=400&&b.links.every(l=>typeof l.id==='string'&&[l.from,l.to].every(id=>b.nodes.some(n=>n.id===id)))&&Array.isArray(b.groups)&&b.groups.length<=50&&b.groups.every(g=>typeof g.id==='string'&&typeof g.title==='string'&&Array.isArray(g.members)&&g.members.every(id=>b.nodes.some(n=>n.id===id)));
}
