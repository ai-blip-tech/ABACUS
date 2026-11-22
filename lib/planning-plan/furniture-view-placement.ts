import clipping from 'polygon-clipping';
import {constrainFloorPoint} from '../measured-plan/measure-floor-constraints.ts';
import type {MeasureDoc,Point} from '../measured-plan/measure-model';
import {detectedRooms} from '../measured-plan/measure-rooms.ts';
import {inside} from '../wall-decoration/surfaces.ts';
import type {FurnitureItem} from './furniture';
import {multiArea,unionRings} from './usable-area.ts';

export type FurnitureViewPose={
 mode:'eye'|'3d';
 position:[number,number,number]; // metres, Three.js XYZ
 direction:[number,number,number];
};

type Footprint=Pick<FurnitureItem,'width'|'depth'|'rotation'|'kind'>;

function rectangle([x,y]:Point,item:Footprint,margin=0):Point[]{
 const a=item.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const w=item.width/2+margin,d=item.depth/2+margin;
 return [[-w,-d],[w,-d],[w,d],[-w,d]].map(([u,v])=>[x+u*c-v*s,y+u*s+v*c]);
}

export function furniturePositionInView(plan:MeasureDoc,pose:FurnitureViewPose,item:Footprint):Point {
 const [x,height,y]=pose.position.map(value=>value*1000);
 const [dx,dy,dz]=pose.direction;
 const origin:Point=[x,y];
 const horizontal=Math.hypot(dx,dz);
 const towards:Point=horizontal>1e-6?[dx/horizontal,dz/horizontal]:[0,0];
 const rooms=detectedRooms(plan);
 const roomAt=(p:Point)=>rooms.find(room=>inside(p,room.polygon)&&!room.holes.some(hole=>inside(p,hole)));
 const zoneAt=(p:Point)=>plan.zones.find(zone=>inside(p,zone.polygon));
 const pointAt=(distance:number):Point=>[x+towards[0]*distance,y+towards[1]*distance];
 const floorHit=dy<-.0001?[0,...new Set(plan.zones.map(zone=>zone.elevation))].flatMap(elevation=>{
  const t=(elevation-height)/dy,point:Point=[x+dx*t,y+dz*t];
  return t>=0&&(zoneAt(point)?.elevation||0)===elevation?[{point,t}]:[];
 }).sort((a,b)=>a.t-b.t)[0]:undefined;

 // In walkthrough the room is fixed before projecting the gaze, even at a door.
 const eyeRoom=roomAt(origin);
 if(pose.mode==='eye'&&!eyeRoom)throw Error('Войдите в нужное помещение и снова откройте каталог мебели.');
 const floorElevation=zoneAt(origin)?.elevation||0;
 const cameraRoom=pose.mode==='eye'||height-floorElevation<=(plan.height??2800)?eyeRoom:undefined;
 const projected=floorHit?.point||pointAt(1800);
 const room=cameraRoom||roomAt(projected);
 if(!room)throw Error('Наведите камеру на пол нужного помещения и снова откройте каталог мебели.');
 const surface=[[room.polygon,...room.holes]];
 const target=cameraRoom?constrainFloorPoint(projected,surface,0,origin):projected;
 const nonBlocking=['rug','lamp','decor','tv'];
 const occupied=item.kind==='rug'?[]:unionRings((plan.furniture||[])
  .filter(other=>!nonBlocking.includes(other.kind))
  .map(other=>rectangle(other.position,other)));
 const free=occupied.length?clipping.difference(surface,occupied):surface;
 const xs=room.polygon.map(p=>p[0]),ys=room.polygon.map(p=>p[1]);
 const footprint=rectangle([0,0],item,5),area=(item.width+10)*(item.depth+10);
 const padX=Math.max(...footprint.map(p=>p[0])),padY=Math.max(...footprint.map(p=>p[1]));
 const minX=Math.min(...xs)+padX,maxX=Math.max(...xs)-padX;
 const minY=Math.min(...ys)+padY,maxY=Math.max(...ys)-padY;
 const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(n,max));
 let best:Point|undefined;
 let score=Infinity;
 const consider=(p:Point)=>{
  const distance=Math.hypot(p[0]-target[0],p[1]-target[1]);
  if(distance>=score||roomAt(p)!==room)return;
  const box=footprint.map(([u,v]):Point=>[p[0]+u,p[1]+v]);
  if(cameraRoom){
   if(horizontal>1e-6&&(p[0]-x)*towards[0]+(p[1]-y)*towards[1]<=0)return;
   if(inside(origin,rectangle(p,item,200)))return;
   const limit=constrainFloorPoint(p,surface,0,origin);
   if(Math.hypot(limit[0]-p[0],limit[1]-p[1])>1)return;
  }
  if(!free.length||area-multiArea(clipping.intersection([box],free))>.5)return;
  best=p;
  score=distance;
 };
 if(minX<=maxX&&minY<=maxY){
  consider([clamp(target[0],minX,maxX),clamp(target[1],minY,maxY)]);
  const step=Math.max(40,Math.max(maxX-minX,maxY-minY)/100);
  for(let gx=minX;gx<=maxX+step;gx+=step){
   const px=Math.min(gx,maxX);
   if(Math.abs(px-target[0])>=score)continue;
   for(let gy=minY;gy<=maxY+step;gy+=step)consider([px,Math.min(gy,maxY)]);
  }
 }
 if(!best)throw Error('Перед камерой нет места для предмета этих размеров. Выберите другой ракурс в этом помещении.');
 return best;
}
