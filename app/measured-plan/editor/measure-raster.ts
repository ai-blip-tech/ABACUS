import {blankDoc,type Source,type MeasureDoc,type Wall} from '../../../lib/measured-plan/measure-model.ts';
// Conservative orthogonal filled-wall detector. Pencil strokes/perspective are manual fallback.
export function detectWalls(data:Uint8ClampedArray,width:number,height:number){
 const mask=new Uint8Array(width*height);for(let i=0;i<mask.length;i++){const j=i*4,r=data[j],g=data[j+1],b=data[j+2],gray=(r+g+b)/3;mask[i]=data[j+3]>128&&gray<120&&Math.max(r,g,b)-Math.min(r,g,b)<38?1:0;}
 const segments:{a:[number,number];b:[number,number];thickness:number}[]=[];
 for(const vertical of [false,true]){
  const rows=vertical?width:height,cols=vertical?height:width;let active:any[]=[];
  const complete=(run:any)=>{const thick=run.last-run.first+1;if(thick<1||thick>Math.min(width,height)*.06||run.end-run.start<Math.max(thick<3?90:65,Math.max(width,height)*.055,thick*4))return;const mid=(run.first+run.last)/2;segments.push({a:vertical?[mid,run.start]:[run.start,mid],b:vertical?[mid,run.end]:[run.end,mid],thickness:thick});};
  for(let row=0;row<rows;row++){
   const found:any[]=[];let start=-1,gap=0;
   for(let col=0;col<=cols;col++){const on=col<cols&&mask[vertical?col*width+row:row*width+col];if(on){if(start<0)start=col;gap=0;}else if(start>=0){gap++;if(gap>2||col===cols){const end=col-gap+1;if(end-start>=38)found.push({start,end});start=-1;gap=0;}}}
   const next:any[]=[];for(const f of found){const prior=active.find(r=>!r.used&&Math.abs(r.start-f.start)<7&&Math.abs(r.end-f.end)<7);if(prior){prior.used=true;next.push({...prior,last:row,start:(prior.start+f.start)/2,end:(prior.end+f.end)/2,used:false});}else next.push({...f,first:row,last:row,used:false});}for(const prior of active)if(!prior.used)complete(prior);active=next;
  }for(const prior of active)complete(prior);
 }
 // Collapse fragments of the same filled stripe, not neighbouring furniture lines.
 const merged:typeof segments=[];
 for(const s of segments.sort((a,b)=>b.thickness-a.thickness)){
  const axis=s.a[0]===s.b[0]?1:0,normal=1-axis;
  const prior=merged.find(p=>(p.a[0]===p.b[0]?1:0)===axis&&Math.abs(p.a[normal]-s.a[normal])<=((p.thickness<12&&s.thickness<3&&Math.abs(p.a[axis]-s.a[axis])<15&&Math.abs(p.b[axis]-s.b[axis])<15)?12:(p.thickness+s.thickness)/2+2)&&s.a[axis]<=p.b[axis]+Math.max(p.thickness,s.thickness)&&s.b[axis]>=p.a[axis]-Math.max(p.thickness,s.thickness));
  if(prior){const lo=Math.min(prior.a[normal]-prior.thickness/2,s.a[normal]-s.thickness/2),hi=Math.max(prior.a[normal]+prior.thickness/2,s.a[normal]+s.thickness/2);prior.a[normal]=prior.b[normal]=(lo+hi)/2;prior.thickness=hi-lo;prior.a[axis]=Math.min(prior.a[axis],s.a[axis]);prior.b[axis]=Math.max(prior.b[axis],s.b[axis]);}else merged.push(structuredClone(s));
 }
 return merged.sort((a,b)=>Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1])-Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1])).slice(0,40);
}
export function estimatedRasterModel(source:Source,candidates:ReturnType<typeof detectWalls>):MeasureDoc{
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
  // Missing top boundary may be a window wall drawn in pale strokes. Infer it
  // as an editable wall, without pretending that openings were recognized.
  const top=bands[0];if(!candidates.some(s=>s.a[1]===s.b[1]&&Math.abs(s.a[1]-top.top)<heavy*2))candidates.push({a:[top.left,top.top],b:[top.right,top.top],thickness:heavy});
 }
 doc.walls=candidates.map((s,i):Wall=>({id:'wall_scan_'+i,name:'Стена '+(i+1),a:s.a.map(x=>Math.round(x*scale)) as [number,number],b:s.b.map(x=>Math.round(x*scale)) as [number,number],thickness:Math.max(75,Math.round(s.thickness*scale)),thicknessConfirmed:false,lengthConfirmed:false,height:null,group:'inner',provenance:'Ориентировочная геометрия по рисунку; требуется обмер'}));
 return doc;
}
export async function rasterDocument(source:Source):Promise<MeasureDoc>{
 const image=new Image();image.src=source.image;await image.decode();const max=2200,ratio=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,canvas.width,canvas.height);const candidates=detectWalls(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
 return estimatedRasterModel(source,candidates.map(s=>({a:s.a.map(x=>x/ratio) as [number,number],b:s.b.map(x=>x/ratio) as [number,number],thickness:s.thickness/ratio})));
}
