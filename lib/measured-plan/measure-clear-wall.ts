import {setWallLength,type MeasureDoc,type Point} from './measure-model.ts';
import {placeWall} from './measure-wall-editing.ts';

export function clearWallDimension(doc:MeasureDoc,id:string){
 const w=doc.walls.find(w=>w.id===id);if(!w)return null;
 const size=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);if(size<1)return null;
 const ux=(w.b[0]-w.a[0])/size,uy=(w.b[1]-w.a[1])/size;
 let start=0,end=size,startHost='',endHost='',missingThickness=false;
 for(const host of doc.walls){if(host.id===id)continue;
  const dx=host.b[0]-host.a[0],dy=host.b[1]-host.a[1],l=Math.hypot(dx,dy);if(l<1)continue;
  const hx=dx/l,hy=dy/l,nx=-hy,ny=hx;
  if(Math.abs(ux*nx+uy*ny)<.01)continue;
  // Clip this wall's centerline against the finite rectangular host wall.
  let low=-Infinity,high=Infinity;
  for(const [px,py,min,max] of [[hx,hy,0,l],[nx,ny,-host.thickness/2,host.thickness/2]]){
   const origin=(w.a[0]-host.a[0])*px+(w.a[1]-host.a[1])*py,rate=ux*px+uy*py;
   if(Math.abs(rate)<1e-10){if(origin<min-.01||origin>max+.01){low=Infinity;break;}}
   else{const a=(min-origin)/rate,b=(max-origin)/rate;low=Math.max(low,Math.min(a,b));high=Math.min(high,Math.max(a,b));}
  }
  if(low>high+.01)continue;
  if(low<=.01&&high>=-.01){if(host.thickness<=0)missingThickness=true;if(high>=start-.001){start=Math.max(0,high);startHost=host.id;}}
  if(low<=size+.01&&high>=size-.01){if(host.thickness<=0)missingThickness=true;if(low<=end+.001){end=Math.min(size,low);endHost=host.id;}}
 }
 if(end<=start||start<0||end>size)return null;
 const a:Point=[w.a[0]+ux*start,w.a[1]+uy*start],b:Point=[w.a[0]+ux*end,w.a[1]+uy*end];
 return {a,b,length:end-start,startTrim:start,endTrim:size-end,startHost,endHost,missingThickness,label:startHost&&endHost?'между гранями':startHost||endHost?'грань — свободный торец':'между свободными торцами'};
}

export function setClearWallLength(doc:MeasureDoc,id:string,mm:number):MeasureDoc{
 const d=clearWallDimension(doc,id),w=doc.walls.find(w=>w.id===id);
 if(!d||!w||d.missingThickness)throw Error('Сначала задайте толщину примыкающих стен');
 if(!Number.isFinite(mm)||mm<1||mm>50000)throw Error('Чистый размер: от 1 до 50 000 мм');
 const size=mm+d.startTrim+d.endTrim;
 let next:MeasureDoc;
 if(id.startsWith('wall_measure_')){
  if(d.startHost&&d.endHost&&Math.abs(mm-d.length)>.01)throw Error('Стена закреплена с двух сторон. Для изменения расстояния передвиньте одну из примыкающих стен.');
  const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l;
  next=d.endHost?placeWall(doc,id,[w.b[0]-ux*size,w.b[1]-uy*size],w.b):placeWall(doc,id,w.a,[w.a[0]+ux*size,w.a[1]+uy*size]);
  next={...next,walls:next.walls.map(w=>w.id===id?{...w,lengthConfirmed:true}:w)};
 }else next=setWallLength(doc,id,size);
 const actual=clearWallDimension(next,id);
 if(!actual||Math.abs(actual.length-mm)>.1)throw Error('Размер конфликтует с примыканиями. Уточните положение соседних стен.');
 return next;
}
