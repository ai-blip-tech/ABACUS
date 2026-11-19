import clipping from 'polygon-clipping';
import {specificationPlan} from './tile-cells.ts';
import type {MeasureDoc,Point} from '../measured-plan/measure-model';
import {floorPlacement} from '../measured-plan/measure-floor-finishes.ts';
import {evaluateTileGrid} from '../tile-grid-optimizer.mjs';
import {multiArea} from '../planning-plan/usable-area.ts';
import {detectedRooms} from '../measured-plan/measure-rooms.ts';
import {geometry,regionProduct,roomForRegion,type Floor2Region,type CoverProduct} from './model.ts';
function scoreGrid(polygons:clipping.MultiPolygon,p:CoverProduct,r:Floor2Region){
 const {origin,angle}=floorPlacement(r),joint=p.category==='tile'?r.tile?.jointMm??2:0;
 if(r.scheme!=='offset')return evaluateTileGrid(polygons,p.widthMm,p.heightMm,joint,origin,angle);
 const rad=angle*Math.PI/180,c=Math.cos(rad),s=Math.sin(rad),local=polygons.map(poly=>poly.map(ring=>ring.map(([x,y])=>[(x-origin[0])*c+(y-origin[1])*s,-(x-origin[0])*s+(y-origin[1])*c] as Point))),pts=local.flat(2),ys=pts.map(p=>p[1]),xs=pts.map(p=>p[0]);
 const py=p.heightMm+joint,first=Math.floor(Math.min(...ys)/py),last=Math.floor(Math.max(...ys)/py),left=Math.min(...xs)-p.widthMm*2,right=Math.max(...xs)+p.widthMm*2;
 if((last-first+1)*Math.ceil((right-left)/(p.widthMm+joint))>100000)throw Error('Слишком много элементов для расчёта');
 const result={count:0,cut:0,tileArea:0,waste:0};for(let row=first;row<=last;row++){const y=row*py,shape=clipping.intersection(local,[[[left,y],[right,y],[right,y+p.heightMm],[left,y+p.heightMm]]]);if(!shape.length)continue;const phase=row%2?(p.widthMm+joint)*(r.rowOffset??1/3):0,q=evaluateTileGrid(shape,p.widthMm,p.heightMm,joint,[phase,y],0);result.count+=q.count;result.cut+=q.cut;result.tileArea+=q.tileArea;result.waste+=q.waste;}return result;
}
export function floorMaterialSpecification(plan:MeasureDoc){
 plan=specificationPlan(plan);
 const groups=new Map<string,{id:string;product:CoverProduct;regions:Floor2Region[]}>();let unassignedArea=0;
 for(const r of plan.floorRegions as Floor2Region[]||[]){if(geometry(plan,r).squareMetres<1e-6)continue;const p=regionProduct(r);if(!p){unassignedArea+=geometry(plan,r).squareMetres;continue;}const id=JSON.stringify([p.id,p.variantId,p.widthMm,p.heightMm,p.price,p.priceUnit]);const old=groups.get(id);if(old)old.regions.push(r);else groups.set(id,{id,product:p,regions:[r]});}
 const materials=[...groups.values()].map(group=>{const p=group.product,areas=group.regions.map(r=>{const g=geometry(plan,r),room=roomForRegion(plan,r)||detectedRooms(plan).map(room=>({room,area:multiArea(clipping.intersection(g.polygons,[[room.polygon,...room.holes]]))})).filter(v=>v.area>1).sort((a,b)=>b.area-a.area)[0]?.room,xs=r.polygon.map(p=>p[0]),ys=r.polygon.map(p=>p[1]);return{id:r.id,name:r.name||room?.name||'Участок',area:g.squareMetres,width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys),level:r.levelMm??0,angle:floorPlacement(r).angle,scheme:r.scheme||'straight'};});
 let quantity:null|{count:number;cut:number;whole:number;purchaseCount:number;packages:number|null;stockArea:number;installedArea:number;wasteArea:number;cost:number|null}=null;
 const supported=!p.repeat&&group.regions.every(r=>['straight','diagonal','offset'].includes(r.scheme||'straight'));
 if(supported){const grids=new Map<string,Floor2Region[]>();for(const r of group.regions){const placement=floorPlacement(r),key=JSON.stringify([placement.origin,placement.angle,r.scheme||'straight',r.rowOffset,r.tile?.jointMm]);grids.set(key,[...(grids.get(key)||[]),r]);}let count=0,cut=0,installedArea=0;for(const rs of grids.values()){const shapes=rs.map(r=>geometry(plan,r).polygons),shape=clipping.union(shapes[0],...shapes.slice(1)),q=scoreGrid(shape,p,rs[0]);count+=q.count;cut+=q.cut;installedArea+=q.tileArea/1e6;}
 const pack=p.packCount&&p.packCount>0?p.packCount:null,packages=pack?Math.ceil(count/pack):null,purchaseCount=pack?packages!*pack:count,stockArea=purchaseCount*p.widthMm*p.heightMm/1e6;
 const unit=(p.priceUnit||'').toLowerCase(),cost=p.price!==undefined&&p.price>=0?(unit==='м²'?stockArea*p.price:unit==='шт'||unit==='шт.'?purchaseCount*p.price:unit==='упак'||unit==='упак.'?packages===null?null:packages*p.price:null):null;
 quantity={count,cut,whole:count-cut,purchaseCount,packages,stockArea,installedArea,wasteArea:Math.max(0,stockArea-installedArea),cost};}
 return{...group,areas,area:areas.reduce((s,r)=>s+r.area,0),quantity};});
 materials.sort((a,b)=>(a.product.category==='tile'?0:1)-(b.product.category==='tile'?0:1));return{drawingPlan:plan,materials,unassignedArea,knownCost:materials.reduce((s,m)=>s+(m.quantity?.cost??0),0),missingCosts:materials.filter(m=>m.quantity?.cost==null).length};
}
