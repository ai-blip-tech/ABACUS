type Point=[number,number];
type Segment={a:Point;b:Point;thickness:number};
type FoundDoor={wallIndex:number;offset:number;width:number;hingesSide:'left'|'right';swingDirection:'inward'|'outward';score:number};

/** Doors require a physical wall gap, an opened leaf and a supported quarter arc.
 * No file identity, room coordinates or default door locations are used. */
export function detectRasterDoors(data:Uint8ClampedArray,width:number,height:number,input:Segment[],columns:{x:number;y:number;width:number;depth:number}[]=[]){
 const walls=structuredClone(input),parent=walls.map((_,i)=>i);
 const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
 const dark=(x:number,y:number,r=1)=>{let minimum=255;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const xx=Math.round(x+dx),yy=Math.round(y+dy);if(xx<0||yy<0||xx>=width||yy>=height)continue;const p=(yy*width+xx)*4;if(data[p+3]<128)continue;minimum=Math.min(minimum,(data[p]+data[p+1]+data[p+2])/3);}return minimum<232;};
 const hypotheses:{a:number;b:number;start:number;end:number;hingesSide:'left'|'right';swingDirection:'inward'|'outward';score:number}[]=[];
 for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){
  const one=walls[i],two=walls[j],axis=one.a[0]===one.b[0]?1:0,normal=1-axis;
  if((two.a[0]===two.b[0]?1:0)!==axis||Math.abs(one.a[normal]-two.a[normal])>Math.max(3,Math.min(one.thickness,two.thickness)*.5))continue;
  const first=one.a[axis]<two.a[axis]?one:two,second=first===one?two:one,start=first.b[axis],end=second.a[axis],radius=end-start;
  if(radius<Math.max(25,Math.max(width,height)*.02,Math.max(first.thickness,second.thickness)*1.5)||radius>Math.max(width,height)*.2)continue;
  if(columns.some(c=>axis===0?one.a[1]>=c.y-3&&one.a[1]<=c.y+c.depth+3&&start<c.x+c.width&&end>c.x:one.a[0]>=c.x-3&&one.a[0]<=c.x+c.width+3&&start<c.y+c.depth&&end>c.y))continue;
  if(walls.some((p,k)=>k!==i&&k!==j&&(p.a[0]===p.b[0]?1:0)===axis&&Math.abs(p.a[normal]-one.a[normal])<3&&p.a[axis]>start&&p.b[axis]<end))continue;
  let best:typeof hypotheses[number]|null=null;
  for(const left of [true,false])for(const sign of [-1,1]){
   const hinge:Point=axis===0?[left?start:end,(one.a[1]+two.a[1])/2]:[(one.a[0]+two.a[0])/2,left?start:end];
   const tangent:Point=axis===0?[left?1:-1,0]:[0,left?1:-1],n:Point=axis===0?[0,sign]:[-sign,0];
   let arc=0,leaf=0;const bins=[0,0,0,0];
   for(let a=0;a<28;a++){const angle=(10+a*70/27)*Math.PI/180;let found=false;for(let dr=-3;dr<=3&&!found;dr++){const r=radius+dr;found=dark(hinge[0]+tangent[0]*r*Math.cos(angle)+n[0]*r*Math.sin(angle),hinge[1]+tangent[1]*r*Math.cos(angle)+n[1]*r*Math.sin(angle));}if(found){arc++;bins[Math.min(3,Math.floor(a/7))]++;}}
   for(let k=1;k<=12;k++)if(dark(hinge[0]+n[0]*radius*k/13,hinge[1]+n[1]*radius*k/13,2))leaf++;
   const score=arc/28;if(score<.65||leaf/12<.6||bins.some(n=>n<3))continue;
   if(!best||score>best.score)best={a:i,b:j,start,end,hingesSide:left?'left':'right',swingDirection:sign===1?'inward':'outward',score};
  }
  if(best)hypotheses.push(best);
 }
 const accepted:typeof hypotheses=[];
 for(const h of hypotheses.sort((a,b)=>b.score-a.score)){
  const ra=root(h.a),rb=root(h.b);if(ra===rb)continue;parent[Math.max(ra,rb)]=Math.min(ra,rb);accepted.push(h);
 }
 const groups=new Map<number,number[]>();for(let i=0;i<walls.length;i++){const r=root(i);groups.set(r,[...(groups.get(r)||[]),i]);}
 const output:Segment[]=[],indices=new Map<number,number>();
 for(const [r,ids]of groups){const base=walls[r],axis=base.a[0]===base.b[0]?1:0,segment=structuredClone(base);segment.a[axis]=Math.min(...ids.map(i=>walls[i].a[axis]));segment.b[axis]=Math.max(...ids.map(i=>walls[i].b[axis]));segment.thickness=Math.max(...ids.map(i=>walls[i].thickness));indices.set(r,output.length);output.push(segment);}
 const doors:FoundDoor[]=accepted.map(h=>{const wallIndex=indices.get(root(h.a))!,w=output[wallIndex],axis=w.a[0]===w.b[0]?1:0;return{wallIndex,offset:(h.start+h.end)/2-w.a[axis],width:h.end-h.start,hingesSide:h.hingesSide,swingDirection:h.swingDirection,score:h.score};});
 return{walls:output,doors};
}
