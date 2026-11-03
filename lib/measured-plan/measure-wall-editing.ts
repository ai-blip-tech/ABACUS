import type {MeasureDoc,Point} from './measure-model';
// Wall coordinates are independent: moving a wall never silently moves other walls.
// Hosted openings retain their measured offset and therefore move with the wall.
export function placeWall(doc:MeasureDoc,id:string,a:Point,b:Point):MeasureDoc{
 const old=doc.walls.find(w=>w.id===id);
 if(!old)throw Error('Стена не найдена');
 const size=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(![...a,...b].every(Number.isFinite)||size<100||size>50000)throw Error('Длина стены должна быть от 100 до 50 000 мм');
 if(old.a.every((n,i)=>n===a[i])&&old.b.every((n,i)=>n===b[i]))return doc;
 const changedLength=Math.abs(size-Math.hypot(old.b[0]-old.a[0],old.b[1]-old.a[1]))>.01;
 return {...doc,walls:doc.walls.map(w=>w.id===id?{...w,a:[...a],b:[...b],lengthConfirmed:changedLength?false:w.lengthConfirmed}:w),geometryReviewed:false,conflictNotes:{},openings:doc.openings.map(o=>o.wallId===id&&changedLength?{...o,confirmed:false}:o)};
}
export function rotateWall(doc:MeasureDoc,id:string,degrees:number):MeasureDoc{
 const w=doc.walls.find(w=>w.id===id);if(!w||!Number.isFinite(degrees))throw Error('Укажите угол поворота');
 const x=(w.a[0]+w.b[0])/2,y=(w.a[1]+w.b[1])/2,r=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])/2,t=degrees*Math.PI/180;
 return placeWall(doc,id,[x-Math.cos(t)*r,y-Math.sin(t)*r],[x+Math.cos(t)*r,y+Math.sin(t)*r]);
}
export function deleteWall(doc:MeasureDoc,id:string):MeasureDoc{
 return {...doc,walls:doc.walls.filter(w=>w.id!==id),openings:doc.openings.filter(o=>o.wallId!==id),geometryReviewed:false,conflictNotes:{}};
}
export function resizeWall(doc:MeasureDoc,id:string,size:number):MeasureDoc{
 const w=doc.walls.find(w=>w.id===id);if(!w||!Number.isFinite(size)||size<100||size>50000)throw Error('Длина стены должна быть от 100 до 50 000 мм');
 const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
 const next=placeWall(doc,id,w.a,[w.a[0]+(w.b[0]-w.a[0])*size/l,w.a[1]+(w.b[1]-w.a[1])*size/l]);
 return {...next,walls:next.walls.map(w=>w.id===id?{...w,lengthConfirmed:true}:w)};
}
export function setWallThicknessFromReference(doc:MeasureDoc,id:string,thickness:number):MeasureDoc{
 const wall=doc.walls.find(w=>w.id===id);if(!wall||!Number.isFinite(thickness)||thickness<50||thickness>1500)throw Error('Толщина стены: от 50 до 1500 мм');
 const next=structuredClone(doc),target=next.walls.find(w=>w.id===id)!,size=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1])||1,reference=wall.referenceLine||'axis';
 if(reference!=='axis'){const direction=reference==='outside'?-1:1,shift=(thickness-wall.thickness)/2*direction,nx=-(wall.b[1]-wall.a[1])/size,ny=(wall.b[0]-wall.a[0])/size;target.a=[target.a[0]+nx*shift,target.a[1]+ny*shift];target.b=[target.b[0]+nx*shift,target.b[1]+ny*shift];}
 target.thickness=thickness;target.thicknessConfirmed=true;next.geometryReviewed=false;next.floorConfirmed=false;return next;
}
