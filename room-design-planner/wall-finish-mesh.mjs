import {getOpeningWallPlacement,getWallFaceOffsets,useScene} from '@pascal-app/core';
import {cells,clippedRevealTriangles,paintedWallTriangles,windowRevealProjections} from './wall-finish-geometry.mjs';

const revealsByGeometry=new WeakMap();
function windowReveals(source,wall,length,height){
 const cached=revealsByGeometry.get(source);
 if(cached)return cached;
 const nodes=useScene.getState().nodes;
 const {a,b}=getWallFaceOffsets(wall);
 const windows=(wall.children||[]).flatMap(id=>{
  const window=nodes[id];
  if(window?.type!=='window'||window.openingShape&&window.openingShape!=='rectangle'||window.source)return [];
  const {position:[x,y,z]}=getOpeningWallPlacement(wall,window,nodes);
  return [{bounds:[x-window.width/2,y-window.height/2,x+window.width/2,y+window.height/2],frameZ:Math.min(a,Math.max(b,z))}];
 });
 const reveals=windowRevealProjections(source.attributes.position.array,source.index?.array,windows,[length,height],[b,a]);
 revealsByGeometry.set(source,reveals);
 return reveals;
}

export function wallFinishMeshData(source,wall,patch,length,masks=[],{offset=0,uv,shape}={}){
 const positions=[],textureCoords=[];
 const reveals=windowReveals(source,wall,length,wall.height);
 const front=paintedWallTriangles(source.attributes.position.array,source.index?.array,patch,length,wall.height,masks,reveals.skip);
 for(let i=0,data=shape?shape(front):front;i<data.length;i+=3){
  const x=data[i],y=data[i+1],z=data[i+2];
  positions.push(x,y,z+patch.side*offset);
  if(uv)textureCoords.push(...uv(x,y));
 }
 const [left,bottom,right,top]=patch.bounds;
 const faces=reveals.faces.filter(({side,bounds:[x0,y0,x1,y1]})=>side===patch.side&&left<x1&&right>x0&&bottom<y1&&top>y0);
 if(!faces.length)return {positions,textureCoords};
 const regions=cells(patch.bounds,masks);
 for(const face of faces){
  const flat=clippedRevealTriangles(face,regions);
  const data=shape?shape(flat):flat;
  for(let i=0;i<data.length;i+=3){
   const x=data[i],y=data[i+1],point=[x,y,face.faceZ];
   const depth=(point[face.axis]-face.edge)*face.direction/face.scale;
   const finishDepth=.0015+offset;
   const corner=Math.max(0,1-depth/.008);
   point[2]+=face.side*(corner*finishDepth-depth);
   point[face.axis]=face.edge-face.direction*finishDepth*(1-corner);
   positions.push(...point);
   if(uv)textureCoords.push(...uv(x,y));
  }
 }
 return {positions,textureCoords};
}
