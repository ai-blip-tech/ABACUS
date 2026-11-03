import clipping from 'polygon-clipping';
import type {MeasureDoc,Point} from './measure-model.ts';
import {wallBodies,wallJoins} from './measure-display.ts';
import {multiArea,ringArea,unionRings,wallRectangle} from '../planning-plan/usable-area.ts';

type Multi=clipping.MultiPolygon;
type Polygon=Multi[number];
export type DetectedRoom={id:string;name:string;polygon:Point[];holes:Point[][];anchor:Point;squareMetres:number};

function pointInside(point:Point,polygon:Point[]){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
 const a=polygon[i],b=polygon[j];if((a[1]>point[1])!==(b[1]>point[1])&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }return inside;
}
function centroid(ring:Point[]):Point{
 let x=0,y=0,area=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],cross=a[0]*b[1]-b[0]*a[1];area+=cross;x+=(a[0]+b[0])*cross;y+=(a[1]+b[1])*cross;}
 if(Math.abs(area)<.001)return ring.reduce((sum,p)=>[sum[0]+p[0]/ring.length,sum[1]+p[1]/ring.length] as Point,[0,0]);
 const result:[number,number]=[x/(3*area),y/(3*area)];if(pointInside(result,ring))return result;
 const box={x0:Math.min(...ring.map(p=>p[0])),x1:Math.max(...ring.map(p=>p[0])),y0:Math.min(...ring.map(p=>p[1])),y1:Math.max(...ring.map(p=>p[1]))};
 for(let rows=4;rows<=20;rows+=4)for(let row=1;row<rows;row++)for(let col=1;col<rows;col++){const p:Point=[box.x0+(box.x1-box.x0)*col/rows,box.y0+(box.y1-box.y0)*row/rows];if(pointInside(p,ring))return p;}
 return ring[0];
}
function roomGeometry(doc:MeasureDoc):Multi{
 if(doc.floor.length<3)return[];
 const bodies=wallBodies(doc.walls),wallSolids=unionRings([...bodies.map(w=>wallRectangle(w)),...wallJoins(bodies,0).map(j=>j.polygon)]);
 const shell=unionRings([...bodies.map(w=>wallRectangle(w)),...wallJoins(bodies,0).map(j=>j.polygon),doc.floor]);
 const columns=unionRings((doc.columns||[]).filter(c=>c.width>0&&c.depth>0).map(c=>[c.a,[c.a[0]+c.width,c.a[1]],[c.a[0]+c.width,c.a[1]+c.depth],[c.a[0],c.a[1]+c.depth]]));
 let result=shell;if(wallSolids.length)result=clipping.difference(result,wallSolids);if(columns.length)result=clipping.difference(result,columns);return result;
}
export function detectedRooms(doc:MeasureDoc):DetectedRoom[]{
 const labels=doc.roomLabels||[];
 return roomGeometry(doc).filter((poly:Polygon)=>multiArea([poly])/1e6>=.25).map((poly:Polygon,index:number)=>{
  const polygon=poly[0].map(p=>[p[0],p[1]] as Point),holes=poly.slice(1).map(r=>r.map(p=>[p[0],p[1]] as Point));
  const anchor=centroid(polygon),saved=labels.find(label=>pointInside(label.anchor,polygon)&&!holes.some(h=>pointInside(label.anchor,h)));
  const signature=`room-${Math.round(anchor[0]/100)}-${Math.round(anchor[1]/100)}`;
  return{id:saved?.id||signature,name:saved?.name||`Помещение ${index+1}`,polygon,holes,anchor,squareMetres:(ringArea(polygon)-holes.reduce((sum,h)=>sum+ringArea(h),0))/1e6};
 }).sort((a,b)=>b.squareMetres-a.squareMetres);
}

export function renameDetectedRoom(doc:MeasureDoc,room:DetectedRoom,name:string):MeasureDoc{
 const next=structuredClone(doc),clean=name.trim()||room.name,labels=(next.roomLabels||[]).filter(label=>label.id!==room.id&&!pointInside(label.anchor,room.polygon));
 next.roomLabels=[...labels,{id:room.id,name:clean,anchor:room.anchor}];return next;
}
