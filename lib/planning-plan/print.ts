import {PDFDocument,rgb,degrees} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {bounds,type MeasureDoc,type Point} from '../measured-plan/measure-model.ts';
import {wallBodies,wallJoins} from '../measured-plan/measure-display.ts';
import {doorSymbol} from '../measured-plan/measure-editing.ts';
import {planDrawingDimensions,openingWidthMarks} from '../measured-plan/measure-annotations.ts';
import {wallNumberMarks} from '../measured-plan/wall-number-layout.ts';
import {drawMeasuredFrame,sheetFormat} from '../measured-plan/print-frame.ts';
import {dimensionLabelLayout} from '../measured-plan/print-dimension-label.ts';
import {addAlbumCover} from '../measured-plan/album-cover.ts';
import type {FurnitureItem} from './furniture.ts';
import {cadWorldPaths} from './dxf-furniture.ts';

/** The same cover/frame/geometry helpers as measured and partition albums. */
export async function planningPDF(doc:MeasureDoc,projectName:string){
 const pdf=PDFDocument.create();const out=await pdf;out.registerFontkit(fontkit);
 const font=await out.embedFont(await readFile(join(process.cwd(),'public/fonts/Arial.ttf')),{subset:true});
 const serif=await out.embedFont(await readFile(join(process.cwd(),'public/fonts/Georgia.ttf')),{subset:true});
 addAlbumCover(out,projectName,{sans:font,serif});
 const page=out.addPage([sheetFormat.width,sheetFormat.height]);drawMeasuredFrame(page,font,{title:'Планировочное решение',sheetNumber:'2'});
 const b=bounds(doc),mm=72/25.4,scale=[20,25,50,75,100,150,200,500,1000,2000,5000].find(s=>b.width/s<345&&b.height/s<185)||5000,factor=mm/scale;
 const ox=35*mm+(345*mm-b.width*factor)/2,oy=sheetFormat.height-24*mm-(185*mm-b.height*factor)/2,black=rgb(.15,.14,.13),grey=rgb(.55,.52,.47),white=rgb(1,1,1);
 const pt=(p:Point)=>({x:ox+(p[0]-b.x)*factor,y:oy-(p[1]-b.z)*factor});
 const line=(a:Point,b:Point,width=.4,color=black,dashArray?:number[])=>page.drawLine({start:pt(a),end:pt(b),thickness:width,color,dashArray});
 const labelBoxes:{left:number;right:number;bottom:number;top:number}[]=[];
 const dimensionText=(a:Point,b:Point,label:string)=>{const p=dimensionLabelLayout(pt(a),pt(b),font.widthOfTextAtSize(label,6),3,labelBoxes),angle=p.angle*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),w=font.widthOfTextAtSize(label,6);
  const corners=[[0,-2],[w,-2],[0,7],[w,7]].map(([x,y])=>({x:p.x+x*c-y*s,y:p.y+x*s+y*c}));labelBoxes.push({left:Math.min(...corners.map(p=>p.x))-2,right:Math.max(...corners.map(p=>p.x))+2,bottom:Math.min(...corners.map(p=>p.y))-2,top:Math.max(...corners.map(p=>p.y))+2});
  page.drawText(label,{x:p.x,y:p.y,font,size:6,color:black,rotate:degrees(p.angle)});
 };
 const poly=(points:Point[],fill=white)=>page.drawSvgPath(points.map((p,i)=>`${i?'L':'M'} ${p[0]-b.x} ${p[1]-b.z}`).join(' ')+' Z',{x:ox,y:oy,scale:factor,color:fill,borderColor:grey,borderWidth:.35/factor});
 for(const w of wallBodies(doc.walls))line(w.a,w.b,Math.max(.5,w.thickness*factor));
 for(const j of wallJoins(wallBodies(doc.walls),0))poly(j.polygon,black);
 for(const c of doc.columns||[]){poly([c.a,[c.a[0]+c.width,c.a[1]],[c.a[0]+c.width,c.a[1]+c.depth],[c.a[0],c.a[1]+c.depth]],black);const p=pt(c.a);page.drawText(c.name,{...p,y:p.y+4,font,size:6,color:black});}
 for(const o of doc.openings){const w=doc.walls.find(w=>w.id===o.wallId);if(!w)continue;const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);if(l<1)continue;const ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l;
  const a:Point=[w.a[0]+ux*(o.offset-o.width/2),w.a[1]+uy*(o.offset-o.width/2)],z:Point=[a[0]+ux*o.width,a[1]+uy*o.width];line(a,z,Math.max(1,w.thickness*factor)+.6,white);
  if(o.kind==='door'){const s=doorSymbol(w,o);line(s.hinge,s.leaf,.5);const start=Math.atan2(s.closed[1]-s.hinge[1],s.closed[0]-s.hinge[0]),end=Math.atan2(s.leaf[1]-s.hinge[1],s.leaf[0]-s.hinge[0]),diff=((end-start+Math.PI*3)%(Math.PI*2))-Math.PI;for(let i=0;i<16;i++){const a=start+diff*i/16,z=start+diff*(i+1)/16;line([s.hinge[0]+Math.cos(a)*s.leafWidth,s.hinge[1]+Math.sin(a)*s.leafWidth],[s.hinge[0]+Math.cos(z)*s.leafWidth,s.hinge[1]+Math.sin(z)*s.leafWidth],.3);}}
  else if(o.kind==='window'){for(const side of [-1,1])line([a[0]-uy*w.thickness*.28*side,a[1]+ux*w.thickness*.28*side],[z[0]-uy*w.thickness*.28*side,z[1]+ux*w.thickness*.28*side],.5);}else line(a,z,.3,black,[2,2]);
 }
 const furniture=(f:FurnitureItem)=>{const angle=f.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),tr=(x:number,y:number):Point=>[f.position[0]+x*c-y*s,f.position[1]+x*s+y*c];
  const rect=(x:number,y:number,w:number,h:number)=>poly([tr(x,y),tr(x+w,y),tr(x+w,y+h),tr(x,y+h)],rgb(.96,.95,.92));
  if(f.cad){for(const path of cadWorldPaths(f)){if(path.fill){const color=path.fill.slice(1),r=parseInt(color.slice(0,2),16)/255,g=parseInt(color.slice(2,4),16)/255,b=parseInt(color.slice(4,6),16)/255;poly(path.points,rgb(r,g,b));}else for(let i=1;i<path.points.length;i++)line(path.points[i-1],path.points[i],.25,grey);}return;}
  const w=f.width,d=f.depth;rect(-w/2,-d/2,w,d);
  if(f.kind==='bed'){rect(-w*.43,-d*.43,w*.39,d*.17);rect(w*.04,-d*.43,w*.39,d*.17);line(tr(-w/2,-d*.2),tr(w/2,-d*.2),.3,grey);}
  else if(f.kind==='sofa'||f.kind==='armchair'){rect(-w/2,-d/2,w,d*.18);rect(-w*.4,-d*.25,w*.8,d*.6);line(tr(0,-d*.25),tr(0,d*.35),.3,grey);}
  else if(['wardrobe','dresser','shelf','kitchen','fridge'].includes(f.kind)){line(tr(0,-d/2),tr(0,d/2),.3,grey);line(tr(-w/2,0),tr(w/2,0),.3,grey);}
  else if(['bath','sink','shower','toilet'].includes(f.kind))rect(-w*.38,-d*.35,w*.76,d*.7);
  else if(f.kind==='chair')line(tr(-w/2,-d*.3),tr(w/2,-d*.3),.6,grey);
 };
 for(const f of doc.furniture||[])furniture(f);
 for(const [i,f] of (doc.furniture||[]).entries()){const p=pt(f.position),text='М'+(i+1);page.drawText(text,{x:p.x-font.widthOfTextAtSize(text,6)/2,y:p.y-2,font,size:6,color:black});}
 for(const d of planDrawingDimensions(doc)){if(!Number.isFinite(d.value)||d.value<1)continue;line(d.a,d.b,.25,black,[1,1]);dimensionText(d.a,d.b,Math.round(d.value).toLocaleString('ru-RU')+' мм');}
 for(const m of openingWidthMarks(doc,6/factor)){line(m.a,m.da,.2);line(m.b,m.db,.2);line(m.da,m.db,.25,black,[1,1]);dimensionText(m.da,m.db,m.label);}
 for(const m of wallNumberMarks(doc,6/factor).filter(m=>!m.id.startsWith('wall_gap_'))){const p=pt([m.x,m.y]),text=String(m.number);page.drawText(text,{x:p.x-font.widthOfTextAtSize(text,6)/2,y:p.y-2,font,size:6,color:black});}
 page.drawText(`Масштаб 1:${scale}. Размеры в мм. К — колонна, М — предмет мебели.`,{x:35*mm,y:68*mm,font,size:7,color:black});
 page.drawText('Предварительное решение. Шаблонные размеры мебели и исходные данные требуют проверки.',{x:35*mm,y:63*mm,font,size:7,color:grey});
 const items=doc.furniture||[];
 for(let start=0;start<items.length;start+=22){const sheet=out.addPage([sheetFormat.width,sheetFormat.height]);drawMeasuredFrame(sheet,font,{title:'Мебель и оборудование',sheetNumber:String(out.getPageCount())});let y=sheetFormat.height-32*mm;
  sheet.drawText('Марка   Предмет / габариты Ш × Г × В, мм / источник размеров',{x:35*mm,y,font,size:11,color:black});y-=24;
  for(const [offset,f] of items.slice(start,start+22).entries()){const name=f.name.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,65),source=f.dimensionsSource==='catalog'?'каталог':f.dimensionsSource==='user'?'пользователь':'шаблон';sheet.drawText(`М${start+offset+1}   ${name}   ${f.width} × ${f.depth} × ${f.height??'—'}   (${source})`,{x:35*mm,y,font,size:8,color:black});y-=18;}
 }
 return out.save();
}
