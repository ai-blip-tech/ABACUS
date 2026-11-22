import type {RefObject} from 'react';
import type {Camera,Quaternion,Vector3} from 'three';
import type {DetectedRoom} from '../lib/measured-plan/measure-rooms';

export type WallCameraPose={
 mode:'eye'|'wall';
 position:Vector3;
 quaternion:Quaternion;
 fov:number;
 fromWalk:boolean;
 room?:Pick<DetectedRoom,'polygon'|'holes'|'anchor'>;
};
export type WallCameraHandoff=RefObject<WallCameraPose|null>;

export function rememberWallCamera(
 handoff:WallCameraHandoff|undefined,camera:Camera,mode:WallCameraPose['mode'],
 fromWalk:boolean,room?:WallCameraPose['room'],
){
 if(!handoff)return;
 const fov='fov' in camera?Number(camera.fov):70;
 const previous=handoff.current;
 if(previous?.mode===mode&&previous.fromWalk===fromWalk&&previous.room===room&&
    previous.fov===fov&&previous.position.equals(camera.position)&&previous.quaternion.equals(camera.quaternion))return;
 handoff.current={mode,position:camera.position.clone(),quaternion:camera.quaternion.clone(),fov,fromWalk,room};
}
