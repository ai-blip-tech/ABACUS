import type {MeasureDoc,Point} from './measure-model';
import {placeWall,rotateWall} from './measure-wall-editing.ts';
const angle=(a:Point,b:Point)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
const delta=(value:number)=>((value+180)%360+360)%360-180;
export function snapWallEdit(doc:MeasureDoc,id:string,mode:'move'|'rotate'|'a'|'b',tolerance=100):MeasureDoc{
 const aligned=snapWallAngle(doc,id,20,mode==='a'?'b':mode==='b'?'a':undefined);
 return mode==='rotate'?aligned:snapWallPosition(aligned,id,mode,tolerance,mode!=='move');
}
export function snapWallAngle(doc:MeasureDoc,id:string,tolerance=20,fixedEnd?:'a'|'b'):MeasureDoc{
 const wall=doc.walls.find(w=>w.id===id);if(!wall)return doc;
 const current=angle(wall.a,wall.b);let best=tolerance+1,turn=0;
 const hosts=doc.walls.filter(w=>w.id!==id&&Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>=1);
 // In an orthogonal plan, an uncorrected sloping partition must not defeat
 // the horizontal/vertical references. Oblique plans retain their own axes.
 const cardinal=delta(Math.round(current/90)*90-current);
 const orthogonal=!hosts.length||hosts.some(w=>Math.abs(delta(angle(w.a,w.b)-Math.round(angle(w.a,w.b)/90)*90))<.1);
 if(orthogonal&&Math.abs(cardinal)<=tolerance){turn=cardinal;best=-1;}
 for(const host of doc.walls){if(host.id===id||Math.hypot(host.b[0]-host.a[0],host.b[1]-host.a[1])<1)continue;
  for(let k=0;k<4;k++){const difference=delta(angle(host.a,host.b)+90*k-current);if(Math.abs(difference)<=tolerance&&Math.abs(difference)<best){best=Math.abs(difference);turn=difference;}}
 }
 if(Math.abs(turn)<=1e-9)return doc;
 if(!fixedEnd)return rotateWall(doc,id,current+turn);
 const pivot=wall[fixedEnd],size=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]),r=(current+turn)*Math.PI/180,sign=fixedEnd==='a'?1:-1;
 const moved:Point=[pivot[0]+sign*Math.cos(r)*size,pivot[1]+sign*Math.sin(r)*size];
 return placeWall(doc,id,fixedEnd==='a'?pivot:moved,fixedEnd==='b'?pivot:moved);
}
// Join endpoints to finite wall segments, not their infinite extensions.
// T-junctions meet the visible host FACE, not its axis. Pick the incoming side
// using the OTHER endpoint so a small overshoot cannot jump to the far face.
export function snapWallPosition(doc:MeasureDoc,id:string,mode:'move'|'a'|'b',tolerance=100,keepAngle=false):MeasureDoc{
 const wall=doc.walls.find(w=>w.id===id);if(!wall)return doc;
 let best:{endpoint:'a'|'b',point:Point,distance:number}|null=null;
 for(const endpoint of (mode==='move'?['a','b']:[mode]) as ('a'|'b')[]){const p=wall[endpoint];
  for(const host of doc.walls){if(host.id===id)continue;
   const dx=host.b[0]-host.a[0],dy=host.b[1]-host.a[1],size=Math.hypot(dx,dy);if(size<1)continue;
   const t=((p[0]-host.a[0])*dx+(p[1]-host.a[1])*dy)/size;
   if(t< -tolerance||t>size+tolerance)continue;
   const nearEnd=t<tolerance?host.a:t>size-tolerance?host.b:null;
   const parallel=Math.abs(Math.sin((angle(wall.a,wall.b)-angle(host.a,host.b))*Math.PI/180))<.02;
   if(parallel&&!nearEnd)continue;
   const clamped=nearEnd===host.a?0:nearEnd===host.b?size:Math.max(0,Math.min(size,t));
   const ux=dx/size,uy=dy/size,nx=-uy,ny=ux,other=wall[endpoint==='a'?'b':'a'];
   const side=((other[0]-host.a[0])*nx+(other[1]-host.a[1])*ny)>=0?1:-1;
   const wallSize=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);
   const cap=Math.max(wall.thickness,70)/2*Math.abs(((wall.b[0]-wall.a[0])*ux+(wall.b[1]-wall.a[1])*uy)/wallSize);
   const half=Math.max(host.thickness,70)/2;
   let target:Point=parallel&&nearEnd?[...nearEnd]:[host.a[0]+ux*clamped+nx*side*(half+cap),host.a[1]+uy*clamped+ny*side*(half+cap)];
   if(keepAngle&&mode!=='move'&&parallel){
    const vx=(p[0]-other[0])/wallSize,vy=(p[1]-other[1])/wallSize;
    if(Math.abs((target[0]-other[0])*vy-(target[1]-other[1])*vx)>.1)continue;
    const along=(target[0]-other[0])*vx+(target[1]-other[1])*vy;
    target=[other[0]+vx*along,other[1]+vy*along];
   }
   if(keepAngle&&mode!=='move'&&!parallel){
    const vx=(p[0]-other[0])/wallSize,vy=(p[1]-other[1])/wallSize,denominator=(vx*nx+vy*ny)*side;
    if(Math.abs(denominator)<1e-6)continue;
    const along=(half+cap-((other[0]-host.a[0])*nx+(other[1]-host.a[1])*ny)*side)/denominator;
    if(along<100)continue;
    target=[other[0]+vx*along,other[1]+vy*along];
    const hostAlong=(target[0]-host.a[0])*ux+(target[1]-host.a[1])*uy;
    if(hostAlong<0||hostAlong>size)continue;
   }
   const distance=Math.hypot(target[0]-p[0],target[1]-p[1]);
   const inside=((p[0]-host.a[0])*nx+(p[1]-host.a[1])*ny)*side<half+cap;
   if(distance>tolerance+(inside?half*2+cap:0))continue;
   if(!best||distance<best.distance)best={endpoint,point:target,distance};
  }
 }
 if(!best||best.distance<1e-8)return doc;
 const dx=best.point[0]-wall[best.endpoint][0],dy=best.point[1]-wall[best.endpoint][1];
 try{return mode==='move'?placeWall(doc,id,[wall.a[0]+dx,wall.a[1]+dy],[wall.b[0]+dx,wall.b[1]+dy]):placeWall(doc,id,mode==='a'?best.point:wall.a,mode==='b'?best.point:wall.b);}catch{return doc;}
}
