export type RasterSegment={a:[number,number];b:[number,number];thickness:number};
export type RasterColumn={x:number;y:number;width:number;depth:number};
const axis=(s:RasterSegment)=>s.a[0]===s.b[0]?1:0;

/** Pair observed faces, not arbitrary nearby axes. Keep unmatched intervals:
 * an opening or a short return must not be filled by the union of two faces. */
export function outlineWallBands(strokes:RasterSegment[],width:number,height:number){
 const pairs:{i:number;j:number;lo:number;hi:number;distance:number}[]=[];
 for(let i=0;i<strokes.length;i++)for(let j=i+1;j<strokes.length;j++){
  const a=strokes[i],b=strokes[j],u=axis(a),n=1-u;if(axis(b)!==u)continue;
  const distance=Math.abs(a.a[n]-b.a[n]),ink=Math.max(a.thickness,b.thickness),lo=Math.max(a.a[u],b.a[u]),hi=Math.min(a.b[u],b.b[u]);
  if(ink>Math.max(8,Math.min(width,height)*.012)||distance<ink*1.35+1||distance>Math.min(width,height)*.065||hi-lo<Math.max(55,distance*4))continue;
  // Closed ends or intersections with the orthogonal wall network distinguish
  // wall faces from dimensions and most furniture contours.
  const connected=(end:number)=>strokes.some(s=>axis(s)!==u&&Math.abs(s.a[u]-end)<=Math.max(ink*2,distance*.8)&&s.a[n]<=Math.min(a.a[n],b.a[n])+ink&&s.b[n]>=Math.max(a.a[n],b.a[n])-ink);
  const longAlignedFaces=hi-lo>Math.max(width,height)*.25&&Math.max(a.b[u]-a.a[u],b.b[u]-b.a[u])>Math.max(width,height)*.4&&Math.min(Math.abs(a.a[u]-b.a[u]),Math.abs(a.b[u]-b.b[u]))<=ink*2&&strokes.some(s=>axis(s)!==u&&Math.min(Math.abs(s.a[u]-lo),Math.abs(s.a[u]-hi))<ink*2&&s.a[n]<=Math.max(a.a[n],b.a[n])+ink&&s.b[n]>=Math.min(a.a[n],b.a[n])-ink);
  if(!connected(lo)&&!connected(hi)&&!longAlignedFaces)continue;
  if(strokes.some((s,k)=>k!==i&&k!==j&&axis(s)===u&&s.a[n]>Math.min(a.a[n],b.a[n])+ink&&s.a[n]<Math.max(a.a[n],b.a[n])-ink&&Math.min(hi,s.b[u])-Math.max(lo,s.a[u])>(hi-lo)*.6))continue;
  pairs.push({i,j,lo,hi,distance});
 }
 const used=new Map<number,[number,number][]>(),bands:RasterSegment[]=[];
 for(const p of pairs.sort((a,b)=>(b.hi-b.lo)/b.distance-(a.hi-a.lo)/a.distance||a.distance-b.distance)){
  const a=strokes[p.i],b=strokes[p.j],u=axis(a),n=1-u;
  const cuts=[p.lo,p.hi,...[p.i,p.j].flatMap(i=>(used.get(i)||[]).flat())].filter(v=>v>=p.lo&&v<=p.hi).sort((a,b)=>a-b);
  for(let k=1;k<cuts.length;k++){const lo=cuts[k-1],hi=cuts[k],mid=(lo+hi)/2;if(hi-lo<Math.max(18,p.distance*2)||[p.i,p.j].some(i=>(used.get(i)||[]).some(([x,y])=>mid>=x&&mid<=y)))continue;
   const low=Math.min(a.a[n]-a.thickness/2,b.a[n]-b.thickness/2),high=Math.max(a.a[n]+a.thickness/2,b.a[n]+b.thickness/2),center=(low+high)/2;
   bands.push({a:(u?[center,lo]:[lo,center]),b:(u?[center,hi]:[hi,center]),thickness:high-low});
   for(const i of [p.i,p.j])used.set(i,[...(used.get(i)||[]),[lo,hi]]);
  }
 }
 const remaining:RasterSegment[]=[];
 strokes.forEach((s,i)=>{const u=axis(s),ranges=(used.get(i)||[]).sort((a,b)=>a[0]-b[0]);if(!ranges.length){remaining.push(s);return;}let start=s.a[u];for(const [lo,hi]of [...ranges,[s.b[u],s.b[u]]]){if(lo-start>Math.max(12,s.thickness*2)){const part=structuredClone(s);part.a[u]=start;part.b[u]=lo;remaining.push(part);}start=Math.max(start,hi);}});
 return {bands,remaining};
}

/** Preliminary column candidates require a closed compact rectangle AND two
 * orthogonal wall bands. A rectangle in furniture alone is not a column. */
export function outlineColumns(data:Uint8ClampedArray,width:number,height:number,strokes:RasterSegment[],walls:RasterSegment[]):RasterColumn[]{
 const dark=(x:number,y:number)=>{for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const xx=Math.round(x+dx),yy=Math.round(y+dy);if(xx<0||yy<0||xx>=width||yy>=height)continue;const i=(yy*width+xx)*4;if(data[i+3]>128&&(data[i]+data[i+1]+data[i+2])/3<150)return true;}return false;};
 const horizontals=strokes.filter(s=>axis(s)===0&&s.b[0]-s.a[0]>=16),found:RasterColumn[]=[];
 for(let i=0;i<horizontals.length;i++)for(let j=i+1;j<horizontals.length;j++){
  const a=horizontals[i],b=horizontals[j],x=Math.max(a.a[0],b.a[0]),right=Math.min(a.b[0],b.b[0]),y=Math.min(a.a[1],b.a[1]),bottom=Math.max(a.a[1],b.a[1]),w=right-x,h=bottom-y;
  if(w<16||h<16||Math.max(w,h)>Math.min(width,height)*.1||w/h<.65||w/h>1.55)continue;
  const edge=(x1:number,y1:number,x2:number,y2:number)=>{let support=0;for(let k=0;k<=20;k++)if(dark(x1+(x2-x1)*k/20,y1+(y2-y1)*k/20))support++;return support>=18;};
  if(!edge(x,y,x,bottom)||!edge(right,y,right,bottom)||!edge(x,y,right,y)||!edge(x,bottom,right,bottom))continue;
  const touch=(u:number)=>walls.some(s=>axis(s)===u&&s.thickness>=7&&(u?s.a[0]>=x-5&&s.a[0]<=right+5&&s.a[1]<=bottom+8&&s.b[1]>=y-8:s.a[1]>=y-s.thickness/2-5&&s.a[1]<=bottom+s.thickness/2+5&&s.a[0]<=right+8&&s.b[0]>=x-8));
  if(!touch(0)||!touch(1)||found.some(c=>Math.abs(c.x-x)<8&&Math.abs(c.y-y)<8))continue;
  if(!walls.some(s=>axis(s)===1&&s.thickness>=7&&s.thickness<w*.85&&s.a[0]>=x&&s.a[0]<=right&&s.b[1]-s.a[1]>h*3&&s.a[1]<=bottom+8&&s.b[1]>=y-8))continue;
  found.push({x,y,width:w,depth:h});
 }
 const unique:RasterColumn[]=[];for(const c of found.sort((a,b)=>a.width*a.depth-b.width*b.depth)){if(unique.some(d=>Math.max(0,Math.min(c.x+c.width,d.x+d.width)-Math.max(c.x,d.x))*Math.max(0,Math.min(c.y+c.depth,d.y+d.depth)-Math.max(c.y,d.y))>Math.min(c.width*c.depth,d.width*d.depth)*.6))continue;unique.push(c);}return unique;
}

export function excludeColumnInteriors(walls:RasterSegment[],columns:RasterColumn[]){
 return walls.flatMap(w=>{const u=axis(w),n=1-u;let intervals=[[w.a[u],w.b[u]]];for(const c of columns){const lo=u?c.y:c.x,hi=lo+(u?c.depth:c.width),normal=u?c.x:c.y,extent=u?c.width:c.depth;if(w.a[n]<normal-2||w.a[n]>normal+extent+2)continue;intervals=intervals.flatMap(([a,b])=>[[a,Math.min(b,lo)],[Math.max(a,hi),b]].filter(([x,y])=>y-x>2));}return intervals.map(([a,b])=>{const s=structuredClone(w);s.a[u]=a;s.b[u]=b;return s;});});
}
