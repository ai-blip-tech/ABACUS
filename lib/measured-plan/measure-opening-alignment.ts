import type {MeasureDoc,Opening,Point} from './measure-model.ts';
import {length} from './measure-model.ts';
import {projectOnWall} from './measure-editing.ts';

export type OpeningAlignmentGuide={a:Point;b:Point;label:string;snapped:boolean};
export function alignOpening(doc:MeasureDoc,opening:Opening,offset=opening.offset,tolerance=80):{offset:number;guides:OpeningAlignmentGuide[]}{
 const host=doc.walls.find(w=>w.id===opening.wallId);if(!host||tolerance<=0)return{offset,guides:[]};
 const size=length(host);if(size<1)return{offset,guides:[]};const ux=(host.b[0]-host.a[0])/size,uy=(host.b[1]-host.a[1])/size,at=(t:number):Point=>[host.a[0]+ux*t,host.a[1]+uy*t];
 const candidates:{offset:number;reference:Point;edge:number;label:string;priority:number}[]=[];
 const fits=(value:number)=>value-opening.width/2>=0&&value+opening.width/2<=size&&!doc.openings.some(o=>o.id!==opening.id&&o.wallId===host.id&&Math.abs(o.offset-value)<(o.width+opening.width)/2-0.1);
 for(const other of doc.openings){if(other.id===opening.id||other.wallId===host.id)continue;const wall=doc.walls.find(w=>w.id===other.wallId);if(!wall)continue;const l=length(wall);if(l<1||Math.abs(((wall.b[0]-wall.a[0])*ux+(wall.b[1]-wall.a[1])*uy)/l)<.999)continue;
  const point=(edge:number):Point=>[wall.a[0]+(wall.b[0]-wall.a[0])/l*(other.offset+edge),wall.a[1]+(wall.b[1]-wall.a[1])/l*(other.offset+edge)];
  const center=point(0);candidates.push({offset:projectOnWall(host,center),reference:center,edge:0,label:'Центры проёмов',priority:0});
  for(const edge of [-opening.width/2,opening.width/2])for(const sourceEdge of [-other.width/2,other.width/2]){const reference=point(sourceEdge);candidates.push({offset:projectOnWall(host,reference)-edge,reference,edge,label:'Края проёмов',priority:1});}
 }
 for(const wall of doc.walls){if(wall.id===host.id)continue;for(const reference of [wall.a,wall.b]){const projected=projectOnWall(host,reference),q=at(projected);if(Math.hypot(q[0]-reference[0],q[1]-reference[1])<1)continue;for(const edge of [0,-opening.width/2,opening.width/2])candidates.push({offset:projected-edge,reference,edge,label:'По границе стены',priority:2});}}
 const near=candidates.filter(c=>fits(c.offset)&&Math.abs(c.offset-offset)<=tolerance*2).sort((a,b)=>a.priority-b.priority||Math.abs(a.offset-offset)-Math.abs(b.offset-offset));
 const snap=near.find(c=>Math.abs(c.offset-offset)<=tolerance),result=snap?.offset??offset;
 const guides=near.filter(c=>snap?Math.abs(c.offset-result)<.1:true).slice(0,3).map(c=>({a:c.reference,b:at(result+c.edge),label:c.label,snapped:Math.abs(c.offset-result)<.1}));
 return{offset:result,guides};
}
