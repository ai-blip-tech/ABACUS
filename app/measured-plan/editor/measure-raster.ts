import {blankDoc,type Source,type MeasureDoc,type Wall} from '../../../lib/measured-plan/measure-model.ts';
import {detectRasterDoors} from './measure-raster-openings.ts';
import {outlineWallBands,outlineColumns,excludeColumnInteriors,type RasterSegment} from './measure-raster-outlines.ts';
// Conservative orthogonal filled-wall detector. Pencil strokes/perspective are manual fallback.
export function detectWalls(data:Uint8ClampedArray,width:number,height:number){return detectRasterStructure(data,width,height).walls;}
export function detectRasterStructure(data:Uint8ClampedArray,width:number,height:number){
 const mask=new Uint8Array(width*height);for(let i=0;i<mask.length;i++){const j=i*4,r=data[j],g=data[j+1],b=data[j+2],gray=(r+g+b)/3;mask[i]=data[j+3]>128&&gray<120&&Math.max(r,g,b)-Math.min(r,g,b)<38?1:0;}
 const segments:{a:[number,number];b:[number,number];thickness:number}[]=[];
 const shortSegments:typeof segments=[];
 const strokes:RasterSegment[]=[];
 for(const vertical of [false,true]){
  const rows=vertical?width:height,cols=vertical?height:width;let active:any[]=[];
  const complete=(run:any)=>{const thick=run.last-run.first+1,len=run.end-run.start;if(thick<1||thick>Math.min(width,height)*.06)return;const mid=(run.first+run.last)/2,s={a:(vertical?[mid,run.start]:[run.start,mid]) as [number,number],b:(vertical?[mid,run.end]:[run.end,mid]) as [number,number],thickness:thick};strokes.push(s);if(len<Math.max(thick<3?90:65,Math.max(width,height)*.055,thick*4)){if(thick>=3&&len>=Math.max(12,thick*2))shortSegments.push(s);return;}segments.push(s);};
  for(let row=0;row<rows;row++){
   const found:any[]=[];let start=-1,gap=0;
for(let col=0;col<=cols;col++){const on=col<cols&&mask[vertical?col*width+row:row*width+col];if(on){if(start<0)start=col;gap=0;}else if(start>=0){gap++;if(gap>2||col===cols){const end=col-gap+1;if(end-start>=12)found.push({start,end});start=-1;gap=0;}}}
   const next:any[]=[];for(const f of found){const prior=active.find(r=>!r.used&&Math.abs(r.start-f.start)<7&&Math.abs(r.end-f.end)<7);if(prior){prior.used=true;next.push({...prior,last:row,start:(prior.start+f.start)/2,end:(prior.end+f.end)/2,used:false});}else next.push({...f,first:row,last:row,used:false});}for(const prior of active)if(!prior.used)complete(prior);active=next;
  }for(const prior of active)complete(prior);
 }
 const pairing=outlineWallBands([...segments,...shortSegments],width,height);
 segments.splice(0,segments.length,...pairing.bands,...pairing.remaining.filter(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>=Math.max(65,Math.max(width,height)*.055)));
 shortSegments.splice(0,shortSegments.length,...pairing.remaining.filter(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])<Math.max(65,Math.max(width,height)*.055)&&s.thickness>=3));
 // Collapse fragments of the same filled stripe, not neighbouring furniture lines.
 const merged:typeof segments=[];
 for(const s of segments.sort((a,b)=>b.thickness-a.thickness)){
  const axis=s.a[0]===s.b[0]?1:0,normal=1-axis;
  const prior=merged.find(p=>(p.a[0]===p.b[0]?1:0)===axis&&(Math.max(p.thickness,s.thickness)/Math.min(p.thickness,s.thickness)<=1.5||Math.min(p.b[axis],s.b[axis])-Math.max(p.a[axis],s.a[axis])>=0)&&Math.abs(p.a[normal]-s.a[normal])<=((p.thickness<12&&s.thickness<3&&Math.abs(p.a[axis]-s.a[axis])<15&&Math.abs(p.b[axis]-s.b[axis])<15)?12:(p.thickness+s.thickness)/2+2)&&s.a[axis]<=p.b[axis]+Math.max(p.thickness,s.thickness)&&s.b[axis]>=p.a[axis]-Math.max(p.thickness,s.thickness));
  if(prior){const lo=Math.min(prior.a[normal]-prior.thickness/2,s.a[normal]-s.thickness/2),hi=Math.max(prior.a[normal]+prior.thickness/2,s.a[normal]+s.thickness/2);prior.a[normal]=prior.b[normal]=(lo+hi)/2;prior.thickness=hi-lo;prior.a[axis]=Math.min(prior.a[axis],s.a[axis]);prior.b[axis]=Math.max(prior.b[axis],s.b[axis]);}else merged.push(structuredClone(s));
 }
 merged.sort((a,b)=>Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1])-Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1]));
 // A short return is evidence when it meets an existing wall, even if it is
 // smaller than the global noise threshold. Isolated short furniture/text stays out.
 for(const s of shortSegments.sort((a,b)=>b.thickness-a.thickness)){
  const axis=s.a[0]===s.b[0]?1:0,normal=1-axis;
  if(merged.some(p=>(p.a[0]===p.b[0]?1:0)===axis&&Math.abs(p.a[normal]-s.a[normal])<(p.thickness+s.thickness)/2+2&&s.a[axis]<=p.b[axis]&&s.b[axis]>=p.a[axis]))continue;
  const host=merged.find(p=>(p.a[0]===p.b[0]?1:0)!==axis&&s.a[normal]>=p.a[normal]-s.thickness&&s.a[normal]<=p.b[normal]+s.thickness&&Math.min(Math.abs(s.a[axis]-p.a[axis]),Math.abs(s.b[axis]-p.a[axis]))<=Math.max(s.thickness,p.thickness)*1.25+3);
  if(!host)continue;const next=structuredClone(s),end=Math.abs(s.a[axis]-host.a[axis])<Math.abs(s.b[axis]-host.a[axis])?next.a:next.b;end[axis]=host.a[axis];
  for(const p of [host.a,host.b])if(Math.hypot(p[0]-end[0],p[1]-end[1])<=Math.max(s.thickness,host.thickness)*1.25+3){p[0]=end[0];p[1]=end[1];}
  merged.push(next);
 }
 const columns=outlineColumns(data,width,height,strokes,merged);
 const significant=merged.filter(s=>s.thickness>=8||Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>=Math.max(width,height)*.25);
 const touching=(p:[number,number],w:RasterSegment)=>{const u=w.a[0]===w.b[0]?1:0,n=1-u,tolerance=Math.max(5,w.thickness*1.25);return Math.abs(p[n]-w.a[n])<=w.thickness/2+5&&p[u]>=w.a[u]-tolerance&&p[u]<=w.b[u]+tolerance;};
 const supported=pairing.bands.length<4?merged:merged.filter(s=>significant.includes(s)||Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>=18&&significant.some(a=>touching(s.a,a)&&significant.some(b=>b!==a&&touching(s.b,b)))&&!significant.some(w=>touching(s.a,w)&&touching(s.b,w)));
 // Extend a centre line to a real junction only when an observed face supports
 // the entire extension. This repairs offset face ends, not arbitrary gaps.
 const joined=structuredClone(supported);
 if(pairing.bands.length>=4)for(const s of joined.filter(s=>s.thickness>=8)){const u=s.a[0]===s.b[0]?1:0,n=1-u;for(const face of strokes){if((face.a[0]===face.b[0]?1:0)!==u||Math.abs(face.a[n]-s.a[n])>s.thickness/2+2||Math.min(face.b[u],s.b[u])-Math.max(face.a[u],s.a[u])<(s.b[u]-s.a[u])*.7)continue;if(s.a[u]-face.a[u]>=0&&s.a[u]-face.a[u]<Math.max(width,height)*.1)s.a[u]=face.a[u];if(face.b[u]-s.b[u]>=0&&face.b[u]-s.b[u]<Math.max(width,height)*.1)s.b[u]=face.b[u];}}
 if(pairing.bands.length>=4)for(const s of joined.filter(s=>s.thickness>=8)){const u=s.a[0]===s.b[0]?1:0,n=1-u;for(const end of [s.a,s.b]){const options=significant.filter(w=>(end===s.a?w.a[u]<=end[u]:w.a[u]>=end[u])&&(w.a[0]===w.b[0]?1:0)!==u&&end[n]>=w.a[n]-s.thickness&&end[n]<=w.b[n]+s.thickness&&Math.abs(end[u]-w.a[u])<Math.max(s.thickness,w.thickness)*1.5).sort((a,b)=>Math.abs(end[u]-a.a[u])-Math.abs(end[u]-b.a[u]));const host=options.find(w=>strokes.some(face=>(face.a[0]===face.b[0]?1:0)===u&&Math.abs(face.a[n]-end[n])<=s.thickness/2+3&&face.a[u]<=Math.min(end[u],w.a[u])+3&&face.b[u]>=Math.max(end[u],w.a[u])-3));if(host)end[u]=host.a[u];}}
 return {walls:excludeColumnInteriors(joined,columns).filter(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>=Math.max(8,s.thickness*.6)).slice(0,100),columns};
}
/** Look outside the dark wall body for a supported pale upper outline. Furniture
 * inside the apartment must not become a perimeter. No unsupported flat closure. */
export function detectUpperOutline(data:Uint8ClampedArray,width:number,height:number,candidates:ReturnType<typeof detectWalls>):[number,number][]{
 const thick=Math.max(0,...candidates.map(s=>s.thickness));
 const vertical=candidates.filter(s=>s.a[0]===s.b[0]&&s.thickness>=thick*.7&&s.b[1]-s.a[1]>Math.max(width,height)*.12);
 if(vertical.length<2)return[];
 const top=Math.min(...vertical.map(s=>s.a[1]));
 const anchors=vertical.filter(s=>Math.abs(s.a[1]-top)<thick*1.2).sort((a,b)=>a.a[0]-b.a[0]);
 if(anchors.length<2)return[];
 const left=anchors[0].a,right=anchors[anchors.length-1].a,start=Math.max(1,Math.floor(top-Math.max(width,height)*.2)),end=Math.min(height-1,Math.ceil(top));
 const gray=(x:number,y:number)=>{const p=(y*width+x)*4;return(data[p]+data[p+1]+data[p+2])/3;};
 const bg=gray(Math.round((left[0]+right[0])/2),start),threshold=Math.min(235,bg-12);
 const raw:{x:number;y:number}[]=[];
 for(let x=Math.ceil(left[0]);x<=Math.floor(right[0]);x++){
  let found=-1;for(let y=start;y<end;y++){let support=0;for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<width&&gray(x+dx,y)<=threshold)support++;if(support>=3){found=y;break;}}
  raw.push({x,y:found});
 }
 const runs:{start:number;end:number;values:number[]}[]=[];
 for(let i=2;i<raw.length-2;i++){const values=raw.slice(i-2,i+3).map(p=>p.y).filter(y=>y>=0).sort((a,b)=>a-b);if(values.length<3)continue;const y=values[Math.floor(values.length/2)],last=runs[runs.length-1];if(last&&raw[i].x-last.end<=2&&Math.abs(last.values[last.values.length-1]-y)<=3){last.end=raw[i].x;last.values.push(y);}else runs.push({start:raw[i].x,end:raw[i].x,values:[y]});}
 const stable=runs.filter(r=>r.end-r.start>=Math.max(12,width*.009)).map(r=>({...r,y:[...r.values].sort((a,b)=>a-b)[Math.floor(r.values.length/2)]}));
 const supported=stable.reduce((n,r)=>n+r.end-r.start,0);
 if(stable.length<1||supported<(right[0]-left[0])*.85)return[];
 const points:[number,number][]=[[...left]];
 let previousY=stable[0].y;points.push([left[0],previousY]);
 for(let i=1;i<stable.length;i++){const boundary=Math.round((stable[i-1].end+stable[i].start)/2);if(Math.abs(stable[i].y-previousY)>4){points.push([boundary,previousY],[boundary,stable[i].y]);previousY=stable[i].y;}}
 points.push([right[0],previousY],[...right]);
 return points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>.1);
}
export function estimatedRasterModel(source:Source,candidates:ReturnType<typeof detectWalls>,upperOutline:[number,number][]=[]):MeasureDoc{
 candidates=structuredClone(candidates);
 const major=candidates.filter(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])>Math.max(source.width,source.height)*.3).map(s=>s.thickness).sort((a,b)=>a-b);
 // A provisional 200 mm stroke is a scale convention, never a recovered measurement.
 const scale=major.length?200/major[Math.floor(major.length/2)]:10000/Math.max(source.width,source.height);
 const doc=blankDoc({...source,pixelScale:scale,method:'raster-estimated',ocrWarning:'Черновик по пропорциям изображения. Масштаб и размеры ориентировочные; подписи размеров не распознаны.'});
 doc.scaleConfirmed=true; // Coordinates now have mm units; real measurements remain unconfirmed below.
 // Infer an orthogonal envelope from substantial vertical wall stripes. This keeps
 // a concave/L-shaped shell instead of inventing the rectangular image boundary.
 const heavy=Math.max(0,...candidates.map(s=>s.thickness));
 const vertical=candidates.filter(s=>s.a[0]===s.b[0]&&s.thickness>=heavy*.7&&s.b[1]-s.a[1]>Math.max(source.width,source.height)*.12);
 const clusters:number[][]=[];for(const y of vertical.flatMap(s=>[s.a[1],s.b[1]]).sort((a,b)=>a-b)){const last=clusters[clusters.length-1];if(!last||y-last[0]>heavy*1.2)clusters.push([y]);else last.push(y);}const levels=clusters.map(c=>c.reduce((a,b)=>a+b,0)/c.length);
 const bands=levels.slice(0,-1).flatMap((y,i)=>{const bottom=levels[i+1],middle=(y+bottom)/2,xs=vertical.filter(s=>s.a[1]-heavy<=middle&&s.b[1]+heavy>=middle).map(s=>s.a[0]);return xs.length>=2?[{top:y,bottom,left:Math.min(...xs),right:Math.max(...xs)}]:[];});
 if(bands.length&&bands.every((b,i)=>!i||Math.abs(b.top-bands[i-1].bottom)<1)){
  const floor:[number,number][]=[];
  const margin=heavy/2+2;
  for(const b of bands){floor.push([b.right+margin,b.top+(b===bands[0]?-margin:margin)],[b.right+margin,b.bottom+margin]);}
  for(const b of [...bands].reverse()){floor.push([b.left-margin,b.bottom+margin],[b.left-margin,b.top+(b===bands[0]?-margin:margin)]);}
  const unique=floor.filter((p,i)=>!i||Math.hypot(p[0]-floor[i-1][0],p[1]-floor[i-1][1])>1);
  doc.floor=unique.map(p=>p.map(v=>Math.round(v*scale)) as [number,number]);
  const top=bands[0];if(upperOutline.length>=2&&!candidates.some(s=>s.a[1]===s.b[1]&&Math.abs(s.a[1]-top.top)<heavy*2)){
   for(let i=1;i<upperOutline.length;i++)candidates.push({a:upperOutline[i-1],b:upperOutline[i],thickness:Math.max(heavy*.35,8)});
   // Replace the straight top floor edge by the same observed stepped outline.
   const first=upperOutline[0],last=upperOutline[upperOutline.length-1];doc.floor[0][1]=Math.round(last[1]*scale);doc.floor[doc.floor.length-1][1]=Math.round(first[1]*scale);
   doc.floor.push(...upperOutline.map(p=>p.map(v=>Math.round(v*scale)) as [number,number]));
  }
 }
 doc.walls=candidates.map((s,i):Wall=>({id:'wall_scan_'+i,name:'Стена '+(i+1),a:s.a.map(x=>Math.round(x*scale)) as [number,number],b:s.b.map(x=>Math.round(x*scale)) as [number,number],thickness:Math.max(75,Math.round(s.thickness*scale)),thicknessConfirmed:false,lengthConfirmed:false,height:null,group:'inner',provenance:'Ориентировочная геометрия по рисунку; требуется обмер'}));
 return doc;
}
export async function rasterDocument(source:Source):Promise<MeasureDoc>{
 const image=new Image();image.src=source.image;await image.decode();const max=2200,ratio=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,canvas.width,canvas.height);const structure=detectRasterStructure(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height),candidates=structure.walls;
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data,doors=detectRasterDoors(pixels,canvas.width,canvas.height,candidates,structure.columns);
 const upper=detectUpperOutline(pixels,canvas.width,canvas.height,doors.walls);
 const doc=estimatedRasterModel(source,doors.walls.map(s=>({a:s.a.map(x=>x/ratio) as [number,number],b:s.b.map(x=>x/ratio) as [number,number],thickness:s.thickness/ratio})),upper.map(p=>p.map(v=>v/ratio) as [number,number]));
 doc.openings=doors.doors.map((o,i)=>({id:'door_arc_'+i,wallId:doc.walls[o.wallIndex].id,kind:'door',width:Math.round(o.width/ratio*doc.source.pixelScale),offset:Math.round(o.offset/ratio*doc.source.pixelScale),height:null,sill:0,hingesSide:o.hingesSide,swingDirection:o.swingDirection,confirmed:false}));
 doc.columns=structure.columns.map((c,i)=>({id:'column_scan_'+i,name:'Колонна К'+(i+1),a:[c.x/ratio*doc.source.pixelScale,c.y/ratio*doc.source.pixelScale],width:c.width/ratio*doc.source.pixelScale,depth:c.depth/ratio*doc.source.pixelScale,height:null,confirmed:false,structuralStatus:'unknown',provenance:'Предположительная колонна по замкнутому контуру у стыка стен; требуется проверка'}));
 return doc;
}
