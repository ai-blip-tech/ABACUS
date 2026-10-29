import type {Point,Wall} from './measure-model.ts';

export type DrawingSnap={point:Point;guides:{axis:'x'|'y';value:number;source:Point}[];label:string};
// Screen-distance tolerance is supplied by the caller: snapping feels identical at every zoom.
export function snapDrawingPoint(raw:Point,start:Point|null,walls:Wall[],tolerance:number,free=false,thickness=100):DrawingSnap{
 if(free)return {point:raw,guides:[],label:''};
 const anchors=walls.flatMap(w=>[w.a,w.b]);
 const nearest=walls.flatMap(w=>[w.a,w.b].map(point=>({point,reach:start&&Math.hypot(point[0]-start[0],point[1]-start[1])<.01?tolerance:tolerance+Math.hypot(Math.max(w.thickness||100,70)/2,Math.max(thickness,70)/2)}))).filter(({point,reach})=>Math.hypot(point[0]-raw[0],point[1]-raw[1])<=reach).sort((a,b)=>Math.hypot(a.point[0]-raw[0],a.point[1]-raw[1])-Math.hypot(b.point[0]-raw[0],b.point[1]-raw[1]))[0]?.point;
 const point:Point=nearest?[...nearest]:[Math.round(raw[0]/10)*10,Math.round(raw[1]/10)*10];
 const guides:DrawingSnap['guides']=[];
 let locked=-1;
 if(start&&!nearest){
  const dx=raw[0]-start[0],dy=raw[1]-start[1];
  if(Math.abs(dy)<=Math.max(tolerance,Math.abs(dx)*Math.tan(Math.PI/12))){point[1]=start[1];locked=1;}
  else if(Math.abs(dx)<=Math.max(tolerance,Math.abs(dy)*Math.tan(Math.PI/12))){point[0]=start[0];locked=0;}
 }
 for(const index of [0,1] as const){
  if(index===locked){guides.push({axis:index===0?'x':'y',value:point[index],source:start!});continue;}
  const candidates=[...anchors,...(start?[start]:[])].filter(p=>Math.abs(p[index]-raw[index])<=tolerance).sort((a,b)=>Math.abs(a[index]-raw[index])-Math.abs(b[index]-raw[index]));
  const source=nearest||candidates[0];
  if(source){point[index]=source[index];guides.push({axis:index===0?'x':'y',value:point[index],source});}
 }
 return {point,guides,label:nearest?'Конец стены':guides.length?locked===0?'Вертикаль':locked===1?'Горизонталь':'Выравнивание':''};
}

export function drawingLengthPoint(a:Point,b:Point,mm:number):Point{
 const size=Math.hypot(b[0]-a[0],b[1]-a[1]);
 if(!Number.isFinite(mm)||mm<100||mm>50000||size<1)throw Error('Длина стены — от 100 до 50 000 мм. Сначала задайте направление мышью.');
 return [a[0]+(b[0]-a[0])*mm/size,a[1]+(b[1]-a[1])*mm/size];
}
