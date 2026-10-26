import type {Column,MeasureDoc,Point,Wall} from './measure-model.ts';
type Segment={a:Point;b:Point};
const cross=(a:Point,b:Point)=>a[0]*b[1]-a[1]*b[0];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1]];
const distance=(a:Point,b:Point)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const signedArea=(p:Point[])=>p.reduce((sum,a,i)=>sum+cross(a,p[(i+1)%p.length]),0)/2;

// Planar half-edge traversal, not a bounding rectangle/convex hull: re-entrant
// corners survive. Virtual bridges affect the slab only, never the actual walls.
export function automaticFloor(walls:Wall[],columns:Column[]=[]):{polygon:Point[];unclosedWallId?:string;reason?:'no-loop'|'disconnected'|'outside'}{
 const columnEdges=columns.filter(c=>c.width>0&&c.width<=200000&&c.depth>0&&c.depth<=200000).flatMap(c=>{const [x,y]=c.a,p:Point[]=[[x,y],[x+c.width,y],[x+c.width,y+c.depth],[x,y+c.depth]];return p.map((a,i)=>({id:c.id,name:c.name,a,b:p[(i+1)%4],thickness:Math.max(c.width,c.depth)*2} as Wall));});
 const valid=[...walls,...columnEdges].filter(w=>[...w.a,...w.b].every(Number.isFinite)&&distance(w.a,w.b)>1);
 if(valid.length<3)return {polygon:[],unclosedWallId:valid[0]?.id};
 const segments:Segment[]=valid.map(w=>({a:[...w.a],b:[...w.b]}));
 // Resolve small center-axis gaps at wall junctions without modifying source geometry.
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j],u=sub(a.b,a.a),v=sub(b.b,b.a),den=cross(u,v);
  if(Math.abs(den)<1e-6)continue;
  const t=cross(sub(b.a,a.a),v)/den,s=cross(sub(b.a,a.a),u)/den;
  const p:Point=[a.a[0]+u[0]*t,a.a[1]+u[1]*t];
  const tolerance=Math.min(500,Math.max(50,valid[i].thickness/2+valid[j].thickness/2+10));
  if(t>=0&&t<=1&&s>=0&&s<=1)continue;
  if((t>=0&&t<=1||Math.min(distance(p,a.a),distance(p,a.b))<=tolerance)&&(s>=0&&s<=1||Math.min(distance(p,b.a),distance(p,b.b))<=tolerance)){
   if(t<0)a.a=p;else if(t>1)a.b=p;
   if(s<0)b.a=p;else if(s>1)b.b=p;
  }
 }
 const tips=segments.flatMap((s,i)=>[{p:s.a,other:s.b,i},{p:s.b,other:s.a,i}]);
 const loose=tips.filter(t=>!segments.some((s,i)=>i!==t.i&&pointOn(t.p,s)));
 const bridges:{a:number;b:number;size:number}[]=[];
 for(let i=0;i<loose.length;i++)for(let j=i+1;j<loose.length;j++){
  const a=loose[i],b=loose[j],u=sub(a.p,a.other),v=sub(b.p,b.other),gap=sub(b.p,a.p),size=distance(a.p,b.p);
  if(a.i===b.i||size<1||size>6000)continue;
  const ul=Math.hypot(...u),vl=Math.hypot(...v);
  if(Math.abs(cross(u,v))/(ul*vl)>.001||Math.abs(cross(u,gap))/ul>20)continue;
  if(u[0]*gap[0]+u[1]*gap[1]<=0||v[0]*gap[0]+v[1]*gap[1]>=0)continue;
  bridges.push({a:i,b:j,size});
 }
 const used=new Set<number>();
 for(const bridge of bridges.sort((a,b)=>a.size-b.size))if(!used.has(bridge.a)&&!used.has(bridge.b)){
  segments.push({a:loose[bridge.a].p,b:loose[bridge.b].p});used.add(bridge.a);used.add(bridge.b);
 }
 const cuts=segments.map(s=>[s.a,s.b]);
 for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
  const a=segments[i],b=segments[j],u=sub(a.b,a.a),v=sub(b.b,b.a),den=cross(u,v);
  if(Math.abs(den)<1e-6){for(const p of [a.a,a.b])if(pointOn(p,b))cuts[j].push(p);for(const p of [b.a,b.b])if(pointOn(p,a))cuts[i].push(p);continue;}
  const t=cross(sub(b.a,a.a),v)/den,s=cross(sub(b.a,a.a),u)/den;
  if(t<-.000001||t>1.000001||s<-.000001||s>1.000001)continue;
  const p:Point=[a.a[0]+t*u[0],a.a[1]+t*u[1]];cuts[i].push(p);cuts[j].push(p);
 }
 const nodes:Point[]=[],adj=new Map<number,Set<number>>();
 function node(p:Point){let i=nodes.findIndex(q=>distance(p,q)<.1);if(i<0){i=nodes.length;nodes.push(p);adj.set(i,new Set());}return i;}
 cuts.forEach((points,i)=>{
  points.sort((a,b)=>distance(a,segments[i].a)-distance(b,segments[i].a));
  for(let k=1;k<points.length;k++){const a=node(points[k-1]),b=node(points[k]);if(a!==b){adj.get(a)!.add(b);adj.get(b)!.add(a);}}
 });
 const sorted=new Map([...adj].map(([id,neighbors])=>[id,[...neighbors].sort((a,b)=>Math.atan2(nodes[a][1]-nodes[id][1],nodes[a][0]-nodes[id][0])-Math.atan2(nodes[b][1]-nodes[id][1],nodes[b][0]-nodes[id][0]))]));
 const visited=new Set<string>(),faces:Point[][]=[];
 for(const [from,neighbors]of sorted)for(const to of neighbors){
  if(visited.has(from+':'+to))continue;
  let a=from,b=to;const path:number[]=[];
  for(let step=0;step<segments.length*8+20;step++){
   const key=a+':'+b;if(visited.has(key))break;visited.add(key);path.push(a);
   const next=sorted.get(b)!;const c=next[(next.indexOf(a)-1+next.length)%next.length];a=b;b=c;
   if(a===from&&b===to){const polygon=path.map(n=>nodes[n]);if(signedArea(polygon)<-100000)faces.push(polygon);break;}
  }
 }
 // A disconnected second building must not silently disappear into the first.
 faces.sort((a,b)=>Math.abs(signedArea(b))-Math.abs(signedArea(a)));
 const outer=faces.filter((face,i)=>!faces.slice(0,i).some(container=>inside(face[0],container)));
 if(outer.length!==1)return {polygon:[],unclosedWallId:valid[0]?.id,reason:outer.length?'disconnected':'no-loop'};
 const polygon=outer[0];
 // Remove dead-end excursions and redundant collinear points from the outer face.
 let changed=true;while(changed&&polygon.length>=3){changed=false;for(let i=0;i<polygon.length;i++){
  const prev=polygon[(i+polygon.length-1)%polygon.length],p=polygon[i],next=polygon[(i+1)%polygon.length];
  if(distance(prev,next)<.1||Math.abs(cross(sub(p,prev),sub(next,p)))<.1){polygon.splice(i,1);changed=true;break;}
 }}
 const outside=walls.find(w=>[w.a,w.b].some(p=>!inside(p,polygon)&&!polygon.some((a,i)=>distanceToSegment(p,{a,b:polygon[(i+1)%polygon.length]})<=Math.max(600,Math.min(1000,Math.abs(w.thickness))))));
 if(outside)return {polygon:[],unclosedWallId:outside.id,reason:'outside'};
 return {polygon:polygon.length>=3?polygon:[],unclosedWallId:polygon.length>=3?undefined:valid[0]?.id};
}
function pointOn(p:Point,s:Segment){const u=sub(s.b,s.a),v=sub(p,s.a),len=Math.hypot(...u);return len>0&&Math.abs(cross(u,v))/len<.1&&v[0]*u[0]+v[1]*u[1]>=-.1&&v[0]*u[0]+v[1]*u[1]<=len*len+.1;}
function distanceToSegment(p:Point,s:Segment){const u=sub(s.b,s.a),v=sub(p,s.a),n=u[0]*u[0]+u[1]*u[1],t=n?Math.max(0,Math.min(1,(v[0]*u[0]+v[1]*u[1])/n)):0;return distance(p,[s.a[0]+u[0]*t,s.a[1]+u[1]*t]);}
function inside(p:Point,polygon:Point[]){let result=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;}return result;}

export function withAutomaticFloor(doc:MeasureDoc,previous?:MeasureDoc|null):MeasureDoc{
 if(doc===previous)return doc;
 return {...doc,floor:automaticFloor(doc.walls,doc.columns).polygon,floorConfirmed:false};
}
