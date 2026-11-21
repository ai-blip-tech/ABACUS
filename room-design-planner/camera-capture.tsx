import {useEffect} from 'react';
import {useThree} from '@react-three/fiber';
import {useScene,sceneRegistry} from '@pascal-app/core';
import {useViewer} from '@pascal-app/viewer';
import {captureSurfaceMap} from './camera-surface-map.mjs';

export function CameraCapture(){
 const {gl,scene,camera,invalidate}=useThree();
 useEffect(()=>{
  const capture=(e:any)=>{
   const requestId=e.detail.requestId;
   window.dispatchEvent(new CustomEvent('roomdesign:wall-finish-command',{detail:{action:'close'}}));
   useViewer.getState().setSelection({selectedIds:[]});
   requestAnimationFrame(()=>requestAnimationFrame(async()=>{
    try{
     gl.render(scene,camera);
     const image=gl.domElement.toDataURL('image/png');
     const surfaceMap=await captureSurfaceMap(gl,scene,camera,sceneRegistry);
     window.dispatchEvent(new CustomEvent('roomdesign:camera-captured',{detail:{
      requestId,image,materials:surfaceMap.samples,
      surfaceMap:{image:surfaceMap.image,surfaces:surfaceMap.surfaces},
      scene:structuredClone({nodes:useScene.getState().nodes,rootNodeIds:useScene.getState().rootNodeIds}),
      camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:(camera as any).fov},
      width:gl.domElement.width,height:gl.domElement.height,
     }}));
    }catch(error){
     window.dispatchEvent(new CustomEvent('roomdesign:camera-captured',{detail:{requestId,error:(error as Error).message}}));
    }finally{gl.render(scene,camera);invalidate();}
   }));
  };
  window.addEventListener('roomdesign:capture-frame',capture);
  return()=>window.removeEventListener('roomdesign:capture-frame',capture);
 },[gl,scene,camera,invalidate]);
 return null;
}
