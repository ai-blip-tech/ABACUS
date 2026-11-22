import {useLayoutEffect,type RefObject} from 'react';
import {useThree} from '@react-three/fiber';
import {Vector3} from 'three';
import type {FurnitureViewPose} from '../lib/planning-plan/furniture-view-placement';

export function FurnitureViewCamera({mode,readPose}:{mode:FurnitureViewPose['mode'];readPose:RefObject<(() => FurnitureViewPose)|null>}){
 const camera=useThree(state=>state.camera);
 useLayoutEffect(()=>{
  readPose.current=()=>({
   mode,
   position:camera.getWorldPosition(new Vector3()).toArray(),
   direction:camera.getWorldDirection(new Vector3()).toArray(),
  });
  return()=>{readPose.current=null;};
 },[mode,readPose,camera]);
 return null;
}
