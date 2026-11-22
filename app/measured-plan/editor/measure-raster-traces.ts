import type {RasterSegment} from './measure-raster-outlines.ts';

/** Follow narrow ink strokes through slight camera skew. Unlike a scan along a
 * fixed pixel row, a trace can drift across rows; gaps remain gaps. Coordinates
 * are rectified to orthogonal axes only for nearly orthogonal long strokes. */
export function traceRasterOutlines(data:Uint8ClampedArray,width:number,height:number){
 const mask=new Uint8Array(width*height);
 for(let i=0;i<mask.length;i++){const j=i*4;mask[i]=data[j+3]>128&&(data[j]+data[j+1]+data[j+2])/3<105?1:0;}
 const segments:RasterSegment[]=[],skews:number[]=[];
 for(const vertical of [true,false]){
  const rows=vertical?height:width,cols=vertical?width:height;
  type Trace={first:number;last:number;centers:number[];sizes:number[];center:number};
  let active:Trace[]=[];
  const complete=(t:Trace)=>{const span=t.last-t.first;if(span<18||t.centers.length/span<.8)return;
   const sorted=[...t.sizes].sort((a,b)=>a-b),thickness=sorted[Math.floor(sorted.length/2)];
   const drift=t.centers.at(-1)!-t.centers[0];if(Math.abs(drift)>Math.max(3,span*.045))return;
   const center=t.centers.reduce((a,b)=>a+b,0)/t.centers.length;
   if(span>=Math.max(65,Math.max(width,height)*.055))skews.push(Math.abs(drift));segments.push({a:vertical?[center,t.first]:[t.first,center],b:vertical?[center,t.last]:[t.last,center],thickness});};
  for(let row=0;row<rows;row++){
   const runs:{center:number;size:number}[]=[];let start=-1;
   for(let col=0;col<=cols;col++){const ink=col<cols&&mask[vertical?row*width+col:col*width+row];if(ink&&start<0)start=col;if(!ink&&start>=0){const size=col-start;if(size>=2&&size<=Math.max(12,Math.min(width,height)*.015))runs.push({center:(start+col-1)/2,size});start=-1;}}
   const used=new Set<Trace>();
   for(const run of runs){const candidates=active.filter(t=>!used.has(t)&&Math.abs(t.center-run.center)<=Math.min(4,1.5+(row-t.last)*.15)&&Math.max(run.size,t.sizes.at(-1)!)/Math.min(run.size,t.sizes.at(-1)!)<2.5).sort((a,b)=>Math.abs(a.center-run.center)-Math.abs(b.center-run.center));const t=candidates[0];
    if(t){t.last=row;t.center=run.center;t.centers.push(run.center);t.sizes.push(run.size);used.add(t);}else{const created={first:row,last:row,centers:[run.center],sizes:[run.size],center:run.center};active.push(created);used.add(created);}}
   active=active.filter(t=>{if(row-t.last<=12)return true;complete(t);return false;});
  }
  active.forEach(complete);
 }
 return {segments,skewed:skews.filter(n=>n>=4).length>=4};
}
