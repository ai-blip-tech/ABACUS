import type {MeasureDoc,Point,Wall,Opening} from './measure-model.ts';
import {projectOnWall,exteriorDoorDirection} from './measure-editing.ts';
import {clearWallDimension} from './measure-clear-wall.ts';
const size=(w:Wall)=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
export function openingAt(doc:MeasureDoc,wallId:string,p:Point,kind:'door'|'window',id:string){
 const w=doc.walls.find(w=>w.id===wallId);if(!w)throw Error('Выберите стену или существующий проём');
 const l=size(w),at=Math.max(0,Math.min(l,projectOnWall(w,p))),existing=doc.openings.filter(o=>o.wallId===wallId).sort((a,b)=>a.offset-b.offset);
 const hit=existing.find(o=>Math.abs(o.offset-at)<=o.width/2);
 if(hit){if(hit.kind!=='opening')throw Error('Здесь уже есть дверь или окно');const next=structuredClone(doc),o=next.openings.find(o=>o.id===hit.id)!;o.kind=kind;o.confirmed=false;o.toCeiling=false;o.sill=kind==='door'?0:doc.openingDefaults?.sill??null;next.geometryReviewed=false;return{doc:next,opening:o};}
 const clear=clearWallDimension(doc,wallId),limits=clear&&!clear.missingThickness?[projectOnWall(w,clear.a),projectOnWall(w,clear.b)].sort((a,b)=>a-b):[0,l];
 let start=Math.max(0,limits[0])+10,end=Math.min(l,limits[1])-10;for(const o of existing){if(o.offset<at)start=Math.max(start,o.offset+o.width/2+10);else end=Math.min(end,o.offset-o.width/2-10);}
 const width=Math.min(kind==='door'?800:1200,Math.floor(end-start));
 if(width<(kind==='door'?200:100))throw Error('На этом участке недостаточно места. Выберите другую стену или уточните размеры');
 const d=doc.openingDefaults||{},opening:Opening={id,wallId,kind,width,offset:Math.max(start+width/2,Math.min(end-width/2,at)),height:(kind==='door'?d.doorHeight:d.windowHeight)??d.commonHeight??null,sill:kind==='door'?0:d.sill??null,confirmed:false,hingesSide:'left',swingDirection:kind==='door'?exteriorDoorDirection(doc,w):'inward'};
 const next=structuredClone(doc);next.openings.push(opening);next.geometryReviewed=false;return{doc:next,opening};
}

// A gap carrier leaves both existing measured walls and their openings intact.
// Its body is completely cut out by the new opening; deleting it restores the gap.
export function openingInGap(doc:MeasureDoc,p:Point,kind:'door'|'window',id:string,tolerance=150){
 let best:{a:Point;b:Point;host:Wall;distance:number}|null=null;
 for(let i=0;i<doc.walls.length;i++)for(let j=i+1;j<doc.walls.length;j++){
  const w=doc.walls[i],v=doc.walls[j];if(w.id.startsWith('wall_gap_')||v.id.startsWith('wall_gap_'))continue;
  const l=size(w),vl=size(v);if(l<1||vl<1)continue;const ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l;
  if(Math.abs(ux*(v.b[1]-v.a[1])/vl-uy*(v.b[0]-v.a[0])/vl)>.001)continue;
  const normal=(q:Point)=>-(q[0]-w.a[0])*uy+(q[1]-w.a[1])*ux,along=(q:Point)=>(q[0]-w.a[0])*ux+(q[1]-w.a[1])*uy;
  if(Math.abs(normal(v.a))>Math.max(2,Math.min(w.thickness,v.thickness)*.1))continue;
  const lo=Math.min(along(v.a),along(v.b)),hi=Math.max(along(v.a),along(v.b));let start:number,end:number;
  if(lo>l){start=l;end=lo;}else if(hi<0){start=hi;end=0;}else continue;
  const width=end-start,t=along(p);if(width<200||width>3000||t<start||t>end||Math.abs(normal(p))>tolerance)continue;
  const blocked=doc.walls.some((s,k)=>{if(k===i||k===j)return false;const sa=along(s.a),sb=along(s.b),na=normal(s.a),nb=normal(s.b);if(Math.abs(na)<1&&Math.abs(nb)<1)return Math.max(sa,sb)>start+1&&Math.min(sa,sb)<end-1;if(na*nb>0||Math.abs(nb-na)<1e-8)return false;const cross=sa+(sb-sa)*(-na)/(nb-na);return cross>start+1&&cross<end-1;});if(blocked)continue;
  const distance=Math.abs(normal(p));if(!best||distance<best.distance)best={a:[w.a[0]+ux*start,w.a[1]+uy*start],b:[w.a[0]+ux*end,w.a[1]+uy*end],host:w,distance};
 }
 if(!best)throw Error('Нажмите на стену или на разрыв между двумя концами одной стены');
 const next=structuredClone(doc),carrier:Wall={...best.host,id:'wall_gap_'+id,a:best.a,b:best.b,name:'Существующий проём',lengthConfirmed:false,provenance:'Основа существующего проёма между стенами'};
 next.walls.push(carrier);const d=doc.openingDefaults||{},opening:Opening={id,wallId:carrier.id,kind,width:size(carrier),offset:size(carrier)/2,height:(kind==='door'?d.doorHeight:d.windowHeight)??d.commonHeight??null,sill:kind==='door'?0:d.sill??null,confirmed:false,hingesSide:'left',swingDirection:kind==='door'?exteriorDoorDirection(doc,carrier):'inward'};
 next.openings.push(opening);next.geometryReviewed=false;return{doc:next,opening};
}
export function removeOpening(doc:MeasureDoc,id:string){const next=structuredClone(doc),o=next.openings.find(o=>o.id===id);next.openings=next.openings.filter(o=>o.id!==id);if(o?.wallId.startsWith('wall_gap_')&&!next.openings.some(p=>p.wallId===o.wallId))next.walls=next.walls.filter(w=>w.id!==o.wallId);next.geometryReviewed=false;return next;}
