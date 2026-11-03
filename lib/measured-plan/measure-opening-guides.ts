import type {MeasureDoc,Opening,Wall} from './measure-model.ts';
import {length} from './measure-model.ts';

export type OpeningGap={start:number;width:number;end:number;nearest:number|null;nearestSide:'start'|'end'|null};
export function openingGaps(doc:MeasureDoc,opening:Opening):OpeningGap{
 const wall=doc.walls.find(w=>w.id===opening.wallId);if(!wall)return{start:0,width:opening.width,end:0,nearest:null,nearestSide:null};
 const start=Math.max(0,opening.offset-opening.width/2),end=Math.max(0,length(wall)-opening.offset-opening.width/2);
 let nearest:number|null=null,nearestSide:'start'|'end'|null=null;
 for(const other of doc.openings)if(other.id!==opening.id&&other.wallId===opening.wallId){const delta=other.offset-opening.offset,gap=Math.abs(delta)-(other.width+opening.width)/2;if(gap>=-.1&&(nearest===null||gap<nearest)){nearest=Math.max(0,gap);nearestSide=delta<0?'start':'end';}}
 return{start,width:opening.width,end,nearest,nearestSide};
}
export function snapOpeningOffset(doc:MeasureDoc,opening:Opening,offset:number,tolerance=80){
 const wall=doc.walls.find(w=>w.id===opening.wallId);if(!wall)return offset;const size=length(wall),candidates=[size/2];
 const others=doc.openings.filter(o=>o.id!==opening.id&&o.wallId===opening.wallId).sort((a,b)=>a.offset-b.offset);
 const boundaries=[{offset:-opening.width/2,width:0},...others,{offset:size+opening.width/2,width:0}];
 for(let i=0;i<boundaries.length-1;i++){const left=boundaries[i].offset+boundaries[i].width/2,right=boundaries[i+1].offset-boundaries[i+1].width/2;candidates.push((left+right)/2);}
 const best=candidates.reduce((current,value)=>Math.abs(value-offset)<Math.abs(current-offset)?value:current,candidates[0]);return Math.abs(best-offset)<=tolerance?best:offset;
}
export function wallAngle(wall:Wall){let angle=Math.atan2(wall.b[1]-wall.a[1],wall.b[0]-wall.a[0])*180/Math.PI;if(angle<0)angle+=360;return Math.round(angle*10)/10;}
export function resizeOpeningFromSide(doc:MeasureDoc,id:string,width:number,fixed:'start'|'end'='start'){
 if(!Number.isFinite(width)||width<100)throw Error('Ширина проёма должна быть не меньше 100 мм');const next=structuredClone(doc),opening=next.openings.find(o=>o.id===id);if(!opening)throw Error('Проём не найден');
 const wall=next.walls.find(w=>w.id===opening.wallId);if(!wall||width>length(wall))throw Error('Проём не помещается на стене');const oldStart=opening.offset-opening.width/2,oldEnd=opening.offset+opening.width/2;
 opening.width=width;opening.offset=fixed==='start'?oldStart+width/2:oldEnd-width/2;if(opening.offset-width/2<0||opening.offset+width/2>length(wall))throw Error('Проём выходит за границы стены');
 if(next.openings.some(other=>other.id!==id&&other.wallId===opening.wallId&&Math.abs(other.offset-opening.offset)<(other.width+opening.width)/2-.1))throw Error('Изменённый проём пересекается с соседним');opening.confirmed=false;next.geometryReviewed=false;return next;
}
