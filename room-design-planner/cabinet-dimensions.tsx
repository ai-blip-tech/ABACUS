import React from 'react';
import {Html,Line} from '@react-three/drei';

type Point=[number,number,number];
type Dimension={from:Point;to:Point;edges:[Point,Point];label:Point;name:string;millimetres:number};

export function CabinetDimensions({dimensions}:{dimensions:[number,number,number]}){
 const [width,height,depth]=dimensions;
 const scale=Math.max(...dimensions);
 const gap=.14*scale,tick=.025*scale;
 const front=depth/2+gap;
 const right=width/2+gap;
 const left=-width/2-gap;
 const floor=-gap*.65;
 const measurements:Dimension[]=[
  {from:[-width/2,floor,front],to:[width/2,floor,front],edges:[[-width/2,0,depth/2],[width/2,0,depth/2]],label:[0,floor-gap*.3,front],name:'Ширина',millimetres:width*1000},
  {from:[right,floor,-depth/2],to:[right,floor,depth/2],edges:[[width/2,0,-depth/2],[width/2,0,depth/2]],label:[right+gap*.3,floor,0],name:'Глубина',millimetres:depth*1000},
  {from:[left,0,front],to:[left,height,front],edges:[[-width/2,0,depth/2],[-width/2,height,depth/2]],label:[left-gap*.35,height/2,front],name:'Высота',millimetres:height*1000},
 ];
 return <group>
  {measurements.map(dimension=><group key={dimension.name}>
   <Line points={[dimension.from,dimension.to]} color="#24211f" lineWidth={1.3} depthTest={false} renderOrder={100}/>
   {[dimension.from,dimension.to].map((point,index)=><group key={index}>
    <Line points={[dimension.edges[index],point]} color="#504b46" lineWidth={.8} depthTest={false} renderOrder={100}/>
    <Line points={[[point[0]-tick,point[1]-tick,point[2]],[point[0]+tick,point[1]+tick,point[2]]]} color="#24211f" lineWidth={1.5} depthTest={false} renderOrder={101}/>
   </group>)}
   <Html center position={dimension.label} zIndexRange={[20,0]} style={{pointerEvents:'none'}}>
    <span className="rd-cabinet-dimension-label">{dimension.name} {Math.round(dimension.millimetres)} мм</span>
   </Html>
  </group>)}
 </group>;
}
