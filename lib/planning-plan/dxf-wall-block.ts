import type {Point} from '../measured-plan/measure-model';
import type {DxfPath} from './dxf-import';
const dot=(p:Point,n:Point)=>p[0]*n[0]+p[1]*n[1];
type Interval=[number,number];
function merge(intervals:Interval[]){const out:Interval[]=[];for(const p of intervals.sort((a,b)=>a[0]-b[0])){const last=out.at(-1);if(last&&p[0]<=last[1]+1)last[1]=Math.max(last[1],p[1]);else out.push([...p]);}return out;}
/** A named straight wall block may contain interrupted faces at doors/windows.
 * Reconstruct only two evidenced parallel faces; never fill an unexplained gap.
 */
export function straightDxfWallBlock(paths:DxfPath[],children:DxfPath[]){
 if(paths.some(p=>p.curved))return null;
 const segments=paths.flatMap(p=>p.points.slice(1).map((b,i)=>({a:p.points[i],b,length:Math.hypot(b[0]-p.points[i][0],b[1]-p.points[i][1])}))).filter(s=>s.length>1);
 const longest=[...segments].sort((a,b)=>b.length-a.length)[0];if(!longest)return null;
 const u:Point=[(longest.b[0]-longest.a[0])/longest.length,(longest.b[1]-longest.a[1])/longest.length];if(u[0]<-.001||Math.abs(u[0])<.001&&u[1]<0){u[0]*=-1;u[1]*=-1;}const n:Point=[-u[1],u[0]];
 const levels:{v:number;intervals:Interval[];coverage:number}[]=[];
 for(const s of segments){if(Math.abs(dot(s.a,n)-dot(s.b,n))>s.length*.002||s.length<longest.length*.05)continue;const v=(dot(s.a,n)+dot(s.b,n))/2,range:Interval=[Math.min(dot(s.a,u),dot(s.b,u)),Math.max(dot(s.a,u),dot(s.b,u))];let level=levels.find(l=>Math.abs(l.v-v)<.5);if(!level){level={v,intervals:[],coverage:0};levels.push(level);}level.intervals.push(range);}
 for(const l of levels){l.intervals=merge(l.intervals);l.coverage=l.intervals.reduce((sum,p)=>sum+p[1]-p[0],0);}levels.sort((a,b)=>b.coverage-a.coverage);
 if(levels.length<2||levels[2]?.coverage>Math.min(levels[0].coverage,levels[1].coverage)*.25)return null;
 const [a,b]=levels,thickness=Math.abs(a.v-b.v);if(thickness<30||thickness>1500||Math.min(a.coverage,b.coverage)<thickness*1.2)return null;
 if(segments.some(s=>Math.abs(dot(s.a,n)-dot(s.b,n))>thickness*1.1))return null;
 const lo=(a.intervals[0][0]+b.intervals[0][0])/2,hi=(a.intervals.at(-1)![1]+b.intervals.at(-1)![1])/2,v=(a.v+b.v)/2;
 if(hi-lo<=thickness)return null;
 const axis=(t:number):Point=>[u[0]*t+n[0]*v,u[1]*t+n[1]*v];
 const covered=merge([...a.intervals.map(p=>[...p] as Interval),...b.intervals.map(p=>[...p] as Interval)]);
 const groups=new Map<string,DxfPath[]>();for(const p of children)groups.set(p.instance,[...(groups.get(p.instance)||[]),p]);
 const gaps:{instance:string;kind:'door'|'window';offset:number;width:number}[]=[];
 for(let i=1;i<covered.length;i++){const start=Math.max(lo,covered[i-1][1]),end=Math.min(hi,covered[i][0]);if(end-start<2)continue;
  const matches=[...groups].filter(([,ps])=>{const pts=ps.flatMap(p=>p.points),ts=pts.map(p=>dot(p,u)),p0=Math.min(...ts),p1=Math.max(...ts),overlap=Math.min(p1,end)-Math.max(p0,start);return overlap>=(end-start)*.85&&Math.min(...pts.map(p=>Math.abs(dot(p,n)-v)))<=thickness/2+15;});
  if(matches.length!==1)return null;const[id,ps]=matches[0];gaps.push({instance:id,kind:ps[0].semantic==='door'?'door':'window',offset:(start+end)/2-lo,width:end-start});
 }
 return{a:axis(lo),b:axis(hi),thickness,gaps};
}
