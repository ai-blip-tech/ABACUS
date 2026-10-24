import {blankDoc,type Source,type MeasureDoc,type Wall} from '@/lib/measured-plan/measure-model';
// Conservative orthogonal filled-wall detector. Pencil strokes/perspective are manual fallback.
export function detectWalls(data:Uint8ClampedArray,width:number,height:number){
 const mask=new Uint8Array(width*height);for(let i=0;i<mask.length;i++){const j=i*4,r=data[j],g=data[j+1],b=data[j+2],gray=(r+g+b)/3;mask[i]=data[j+3]>128&&gray<205&&Math.max(r,g,b)-Math.min(r,g,b)<38?1:0;}
 const segments:{a:[number,number];b:[number,number];thickness:number}[]=[];
 for(const vertical of [false,true]){
  const rows=vertical?width:height,cols=vertical?height:width;let active:any[]=[];
  const complete=(run:any)=>{const thick=run.last-run.first+1;if(thick<4||thick>Math.min(width,height)*.09||run.end-run.start<Math.max(38,thick*3))return;const mid=(run.first+run.last)/2;segments.push({a:vertical?[mid,run.start]:[run.start,mid],b:vertical?[mid,run.end]:[run.end,mid],thickness:thick});};
  for(let row=0;row<rows;row++){
   const found:any[]=[];let start=-1,gap=0;
   for(let col=0;col<=cols;col++){const on=col<cols&&mask[vertical?col*width+row:row*width+col];if(on){if(start<0)start=col;gap=0;}else if(start>=0){gap++;if(gap>2||col===cols){const end=col-gap+1;if(end-start>=38)found.push({start,end});start=-1;gap=0;}}}
   const next:any[]=[];for(const f of found){const prior=active.find(r=>!r.used&&Math.abs(r.start-f.start)<7&&Math.abs(r.end-f.end)<7);if(prior){prior.used=true;next.push({...prior,last:row,start:(prior.start+f.start)/2,end:(prior.end+f.end)/2,used:false});}else next.push({...f,first:row,last:row,used:false});}for(const prior of active)if(!prior.used)complete(prior);active=next;
  }for(const prior of active)complete(prior);
 }
 // Longest candidates first; prevent pathological illustrations creating thousands of entities.
 return segments.sort((a,b)=>Math.hypot(...[b.b[0]-b.a[0],b.b[1]-b.a[1]])-Math.hypot(...[a.b[0]-a.a[0],a.b[1]-a.a[1]])).slice(0,80);
}
export async function rasterDocument(source:Source):Promise<MeasureDoc>{
 const image=new Image();image.src=source.image;await image.decode();const max=1400,ratio=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.round(image.naturalWidth*ratio);canvas.height=Math.round(image.naturalHeight*ratio);const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0,canvas.width,canvas.height);const candidates=detectWalls(ctx.getImageData(0,0,canvas.width,canvas.height).data,canvas.width,canvas.height);
 const scale=source.pixelScale;const doc=blankDoc({...source,method:'local-raster-candidates'});doc.walls=candidates.map((s,i):Wall=>({id:'wall_scan_'+i,name:'Стена '+(i+1),a:s.a.map(x=>x/ratio*scale) as any,b:s.b.map(x=>x/ratio*scale) as any,thickness:Math.round(s.thickness/ratio*scale),thicknessConfirmed:false,lengthConfirmed:false,height:null,group:'inner',provenance:'Кандидат локального детектора; не подтверждено'}));
 doc.floor=[[0,0],[source.width*scale,0],[source.width*scale,source.height*scale],[0,source.height*scale]];return doc;
}
