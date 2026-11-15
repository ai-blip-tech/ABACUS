import {useEffect,useRef} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {sceneRegistry,useScene} from '@pascal-app/core';
import {getMaterialsForWall,getWallFinishRefs,useViewer} from '@pascal-app/viewer';
import {Matrix4,Vector3} from 'three';
import {wallProximityOpacity} from './wall-proximity-math.mjs';
/** View-only transparency. No node edits, no persisted opacity, no shared material mutation. */
export function WallProximity(){
 const entries=useRef(new Map<string,any>()),invalidate=useThree(s=>s.invalidate);
 const inverse=useRef(new Matrix4()),position=useRef(new Vector3()),direction=useRef(new Vector3());
 useEffect(()=>{const previous=useViewer.getState().wallMode;useViewer.getState().setWallMode('cutaway');return()=>{for(const e of entries.current.values()){if(e.mesh.material===e.ghost)e.mesh.material=e.base;e.mesh.castShadow=e.cast;e.mesh.userData.wallHidden=false;e.ghost.forEach((m:any)=>m.dispose());}entries.current.clear();useViewer.getState().setWallMode(previous);};},[]);
 useFrame(({camera})=>{
  const state=useScene.getState(),viewer=useViewer.getState(),live=new Set<string>();
  for(const id of sceneRegistry.byType.wall){
   const mesh:any=sceneRegistry.nodes.get(id),node:any=state.nodes[id];if(!mesh?.geometry||!node)continue;live.add(id);
   mesh.updateWorldMatrix(true,false);if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();const box=mesh.geometry.boundingBox;if(!box)continue;
   inverse.current.copy(mesh.matrixWorld).invert();camera.getWorldPosition(position.current).applyMatrix4(inverse.current);camera.getWorldDirection(direction.current).transformDirection(inverse.current);
   const target=wallProximityOpacity(position.current.toArray(),direction.current.toArray(),box.min.toArray(),box.max.toArray(),entries.current.get(id)?.alpha===0);
   const base=getMaterialsForWall(node,viewer.shading,viewer.textures,viewer.colorPreset,viewer.sceneTheme,state.materials,getWallFinishRefs(mesh.geometry)).visible;
   let e=entries.current.get(id);
   if(!e||e.mesh!==mesh||e.base.length!==base.length||e.base.some((m:any,i:number)=>m!==base[i])){
    const alpha=e?.alpha??1,cast=e?.cast??mesh.castShadow;if(e){if(e.mesh.material===e.ghost)e.mesh.material=e.base;e.ghost.forEach((m:any)=>m.dispose());}
    e={mesh,base,alpha,cast,ghost:base.map((m:any)=>{const clone=m.clone();clone.transparent=true;clone.depthWrite=false;clone.opacity=0;clone.visible=false;return clone;})};entries.current.set(id,e);
   }
   const changed=e.alpha!==target;e.alpha=target;
   const faded=e.alpha<.998;mesh.userData.wallHidden=faded;mesh.castShadow=faded?false:e.cast;
   if(faded){for(let i=0;i<e.ghost.length;i++)e.ghost[i].opacity=e.base[i].opacity*e.alpha;mesh.material=e.ghost;}else mesh.material=e.base;
   if(changed)invalidate();
  }
  for(const[id,e]of entries.current)if(!live.has(id)){e.ghost.forEach((m:any)=>m.dispose());entries.current.delete(id);}
 },0.5); // WallCutout (0), host fade, render (1). Batch exclusions reconcile at (5).
 return null;
}
