import type {MeasureDoc,Wall} from './measure-model.ts';
import {doorSymbol} from './measure-editing.ts';
const valid=(n:number|null)=>n!==null&&Number.isFinite(n)&&n>0;
export function heightLabelPosition(doc:MeasureDoc,w:Wall,label:string,font:number){
 const size=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])||1,nx=-(w.b[1]-w.a[1])/size,ny=(w.b[0]-w.a[0])/size,cx=(w.a[0]+w.b[0])/2,cy=(w.a[1]+w.b[1])/2,offset=w.thickness/2+font*4.2;
 const preferred=Math.abs(nx)>.5?(nx>=0?1:-1):(ny>=0?1:-1);
 const obstacles=doc.openings.filter(o=>o.kind==='door').flatMap(o=>{const host=doc.walls.find(w=>w.id===o.wallId);if(!host)return[];const s=doorSymbol(host,o),points=[s.hinge,s.closed,s.leaf];return[{left:Math.min(...points.map(p=>p[0]))-font*.3,right:Math.max(...points.map(p=>p[0]))+font*.3,top:Math.min(...points.map(p=>p[1]))-font*.3,bottom:Math.max(...points.map(p=>p[1]))+font*.3}];});
 return [preferred,-preferred].map(sign=>{const x=cx+nx*offset*sign,y=cy+ny*offset*sign,half=label.length*font*.3;const collisions=obstacles.filter(b=>x+half>b.left&&x-half<b.right&&y+font*.2>b.top&&y-font*1.5<b.bottom).length;return{x,y,cx,cy,nx:nx*sign,ny:ny*sign,collisions};}).sort((a,b)=>a.collisions-b.collisions)[0];
}
export function planHeightLabels(doc:MeasureDoc){
 const common=valid(doc.height)?doc.height:null;
 return {common:common===null?'H — общая высота стен не задана':`H = ${Math.round(common)} мм — общая высота стен`,walls:doc.walls.filter(w=>valid(w.height)&&(common===null||Math.abs(w.height!-common)>=.5)).map(w=>({id:w.id,height:w.height!,label:`H = ${Math.round(w.height!)} мм`}))};
}
