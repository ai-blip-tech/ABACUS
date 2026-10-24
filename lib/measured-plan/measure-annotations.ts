import type {MeasureDoc,Point} from './measure-model.ts';
import {heightLabelPosition} from './measure-heights.ts';
import {clearDimensions} from './measure-model.ts';

/** The editor and printed sheet must use this same list, never per-wall print-only lengths. */
export function planDrawingDimensions(doc:MeasureDoc){
 return [...clearDimensions(doc).map((d,i)=>({...d,id:'room-'+i,kind:'room' as const,value:Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1])})),...(doc.dimensions||[]).map(d=>({...d,kind:'additional' as const,value:Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1])}))];
}

/** Thickness is an actual measured dimension, not proof of structural function. */
export function thicknessNotes(doc:MeasureDoc){
 const lines:string[]=[];
 for(const [group,title] of [['outer','Наружные стены'],['inner','Внутренние стены / перегородки']] as const){
  const walls=doc.walls.map((w,i)=>({w,number:i+1})).filter(({w})=>w.group===group);
  if(!walls.length)continue;
  const values=new Map<number,number[]>();
  for(const {w,number} of walls){const value=Number.isFinite(w.thickness)&&w.thickness>0?Math.round(w.thickness):0;values.set(value,[...(values.get(value)||[]),number]);}
  const sorted=[...values].sort((a,b)=>b[1].length-a[1].length||a[0]-b[0]);
  const [base,numbers]=sorted[0];
  lines.push(`${title}: толщина ${base?base+' мм':'не задана'}${sorted.length>1?' (типовая)':''}${walls.some(({w})=>!w.thicknessConfirmed)?' · проверить обмер':''}`);
  for(const [value,ids] of sorted.slice(1))lines.push(`Стены № ${ids.join(', ')}: толщина ${value?value+' мм':'не задана'}`);
 }
 return lines;
}

export function openingWidthMarks(doc:MeasureDoc,font:number){
 return doc.openings.flatMap(o=>{
  const w=doc.walls.find(w=>w.id===o.wallId);if(!w)return[];
  const size=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);if(size<1||!Number.isFinite(o.width)||o.width<=0)return[];
  const ux=(w.b[0]-w.a[0])/size,uy=(w.b[1]-w.a[1])/size;
  const a:Point=[w.a[0]+ux*(o.offset-o.width/2),w.a[1]+uy*(o.offset-o.width/2)],b:Point=[a[0]+ux*o.width,a[1]+uy*o.width];
  const label=`${Math.round(o.width)} мм`,layout=heightLabelPosition(doc,{...w,a,b},label,font),offset=w.thickness/2+font*5;
  const da:Point=[a[0]+layout.nx*offset,a[1]+layout.ny*offset],db:Point=[b[0]+layout.nx*offset,b[1]+layout.ny*offset];
  return [{id:o.id,kind:o.kind,a,b,da,db,label,nx:layout.nx,ny:layout.ny}];
 });
}
