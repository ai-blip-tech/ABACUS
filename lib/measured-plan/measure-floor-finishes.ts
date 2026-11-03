import clipping from 'polygon-clipping';
import type {MeasureDoc,Point} from './measure-model.ts';
import {multiArea,ringArea,usablePlanArea} from '../planning-plan/usable-area.ts';

export const parquetLayouts=[
 {id:'straight',name:'Палубная укладка',english:'Straight Plank'},
 {id:'diagonal',name:'Диагональная укладка',english:'Diagonal Plank'},
 {id:'herringbone',name:'Английская ёлочка',english:'Herringbone'},
 {id:'chevron',name:'Французская ёлочка',english:'Chevron'},
 {id:'basket',name:'Плетёнка',english:'Basket Weave'},
 {id:'versailles',name:'Версаль',english:'Versailles'},
] as const;
export type ParquetLayout=typeof parquetLayouts[number]['id'];
export type FloorWood='oak'|'walnut';
export type FloorRegion={id:string;polygon:Point[];layout:ParquetLayout|null;wood:FloorWood;origin?:Point;angle?:number};

const cross=(a:Point,b:Point,c:Point)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const on=(a:Point,b:Point,p:Point)=>Math.abs(cross(a,b,p))<.001&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]);
function intersects(a:Point,b:Point,c:Point,d:Point){return cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
export function floorPolygon(points:Point[]):Point[]{
 if(!Array.isArray(points)||points.length>200||points.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||Math.abs(n)>200000)))throw Error('Некорректный контур участка пола');
 const polygon=points.filter((p,i)=>i===0||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>.1).map(p=>[...p] as Point);
 if(polygon.length>1&&Math.hypot(polygon[0][0]-polygon.at(-1)![0],polygon[0][1]-polygon.at(-1)![1])<.1)polygon.pop();
 if(polygon.length<3)throw Error('Для пола нужны минимум три угла');
 for(let i=0;i<polygon.length;i++)for(let j=i+1;j<polygon.length;j++){if(j===i+1||i===0&&j===polygon.length-1)continue;if(intersects(polygon[i],polygon[(i+1)%polygon.length],polygon[j],polygon[(j+1)%polygon.length]))throw Error('Контур пола пересекает сам себя. Измените положение углов');}
 if(ringArea(polygon)<10000)throw Error('Участок пола слишком мал — выберите площадь больше 0,01 м²');
 return polygon;
}
export function validateFloorRegions(value:unknown):FloorRegion[]{
 if(!Array.isArray(value)||value.length>100)throw Error('Можно сохранить не более 100 участков пола');
 const ids=new Set<string>();for(const region of value){if(!region||typeof region.id!=='string'||!/^[a-zA-Z0-9_-]{1,140}$/.test(region.id)||ids.has(region.id)||!['oak','walnut'].includes(region.wood)||region.layout!==null&&!parquetLayouts.some(layout=>layout.id===region.layout))throw Error('Некорректные параметры участка пола');if(region.angle!==undefined&&(!Number.isFinite(region.angle)||Math.abs(region.angle)>36000)||region.origin!==undefined&&(!Array.isArray(region.origin)||region.origin.length!==2||region.origin.some((n:number)=>!Number.isFinite(n)||Math.abs(n)>200000)))throw Error('Некорректная ось раскладки');floorPolygon(region.polygon);ids.add(region.id);}
 return structuredClone(value);
}
export function floorRegionGeometry(doc:MeasureDoc,region:FloorRegion){
 const polygon=floorPolygon(region.polygon),surface=doc.floor.length>=3?usablePlanArea(doc).polygons:null;
 const polygons=surface?surface.length?clipping.intersection([polygon],surface):[]:[[polygon]] as clipping.MultiPolygon;
 return{polygons,squareMetres:multiArea(polygons)/1e6};
}
export function floorRegionPath(polygons:clipping.MultiPolygon){return polygons.flatMap(p=>p.map(r=>'M '+r.map(p=>p.join(' ')).join(' L ')+' Z')).join(' ');}

/** Move the whole region, one corner, or an edge along its normal. */
export function editFloorPolygon(polygon:Point[],kind:'move'|'vertex'|'edge',index:number,delta:Point):Point[]{
 const next=polygon.map(p=>[...p] as Point);
 if(kind==='move')return floorPolygon(next.map(p=>[p[0]+delta[0],p[1]+delta[1]]));
 if(!Number.isInteger(index)||index<0||index>=next.length)throw Error('Угол участка не найден');
 let shift=delta;
 if(kind==='edge'){const a=next[index],b=next[(index+1)%next.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.1)throw Error('Слишком короткая грань');const nx=-(b[1]-a[1])/len,ny=(b[0]-a[0])/len,d=delta[0]*nx+delta[1]*ny;shift=[nx*d,ny*d];}
 const indexes=kind==='edge'?[index,(index+1)%next.length]:[index];
 for(const i of indexes)next[i]=[next[i][0]+shift[0],next[i][1]+shift[1]];
 return floorPolygon(next);
}
export function floorPlacement(region:FloorRegion){
 const xs=region.polygon.map(p=>p[0]),ys=region.polygon.map(p=>p[1]);
 return{origin:region.origin||[(Math.min(...xs)+Math.max(...xs))/2,Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*.68] as Point,angle:region.angle??(['chevron','herringbone'].includes(region.layout||'')?90:0)};
}
