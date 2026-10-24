import {requireTenantUser} from '@/lib/auth';
import {database} from '@/lib/server-runtime';
import {ensureMeasuredStore} from '@/lib/measured-plan/store';
import {bounds,type MeasureDoc} from '@/lib/measured-plan/measure-model';

import {doorSymbol} from '@/lib/measured-plan/measure-editing';
import {wallJoins,wallBodies} from '@/lib/measured-plan/measure-display';
import {planHeightLabels,heightLabelPosition} from '@/lib/measured-plan/measure-heights';
import {thicknessNotes,openingWidthMarks,planDrawingDimensions} from '@/lib/measured-plan/measure-annotations';
import {drawMeasuredFrame,drawMeasuredNotes,sheetFormat} from '@/lib/measured-plan/print-frame';
import {dimensionLabelLayout} from '@/lib/measured-plan/print-dimension-label';
import {wallNumberMarks} from '@/lib/measured-plan/wall-number-layout';
import {addAlbumCover} from '@/lib/measured-plan/album-cover';
import {PDFDocument,rgb,degrees} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export const runtime='nodejs';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await requireTenantUser(request);if(!user)return new Response('Требуется вход',{status:401});const {id}=await params;const project=await database.prepare('SELECT id,name FROM projects WHERE id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{id:string;name:string}>();if(!project)return new Response('Проект не найден',{status:404});
 ensureMeasuredStore();const saved=await database.prepare('SELECT document_json FROM measured_plans WHERE project_id=? AND user_id=? AND tenant_id=?').bind(id,user.id,user.tenantId).first<{document_json:string}>();if(!saved)return new Response('Сначала сохраните обмерный план',{status:404});
 try{
  const doc=JSON.parse(saved.document_json) as MeasureDoc;if(!doc.scaleConfirmed)return new Response('Сначала задайте масштаб плана',{status:400});const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(await readFile(join(process.cwd(),'public/fonts/Arial.ttf')),{subset:true});
  const serif=await pdf.embedFont(await readFile(join(process.cwd(),'public/fonts/Georgia.ttf')),{subset:true});addAlbumCover(pdf,project.name,{sans:font,serif});
  const mm=72/25.4,W=sheetFormat.width,H=sheetFormat.height,page=pdf.addPage([W,H]),black=rgb(0,0,0),grey=rgb(.38,.38,.38),white=rgb(1,1,1),box=bounds(doc);
  const notes=thicknessNotes(doc),drawingHeight=205;
  const scale=[20,25,50,75,100,150,200,500,1000,2000].find(s=>box.width/s<365&&box.height/s<drawingHeight)||2000,factor=mm/scale;
  const ox=25*mm+(365*mm-box.width*factor)/2,oy=H-15*mm-(drawingHeight*mm-box.height*factor)/2;
  const pt=(p:[number,number])=>({x:ox+(p[0]-box.x)*factor,y:oy-(p[1]-box.z)*factor});
  const line=(a:[number,number],b:[number,number],thickness=.4,color=black)=>page.drawLine({start:pt(a),end:pt(b),thickness,color});

  drawMeasuredFrame(page,font);
  for(const w of wallBodies(doc.walls))line(w.a,w.b,Math.max(.5,w.thickness*factor));
  for(const joint of wallJoins(wallBodies(doc.walls),0)){const path=joint.polygon.map((p,i)=>`${i?'L':'M'} ${p[0]-box.x} ${p[1]-box.z}`).join(' ')+' Z';page.drawSvgPath(path,{x:ox,y:oy,scale:factor,color:black});}
  for(const o of doc.openings){const w=doc.walls.find(w=>w.id===o.wallId);if(!w)continue;const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l,a:[number,number]=[w.a[0]+ux*(o.offset-o.width/2),w.a[1]+uy*(o.offset-o.width/2)],b:[number,number]=[a[0]+ux*o.width,a[1]+uy*o.width];line(a,b,Math.max(1,w.thickness*factor)+.6,white);if(o.kind==='door'){const symbol=doorSymbol(w,o);line(symbol.hinge,symbol.leaf,.5);const start=Math.atan2(symbol.closed[1]-symbol.hinge[1],symbol.closed[0]-symbol.hinge[0]),end=Math.atan2(symbol.leaf[1]-symbol.hinge[1],symbol.leaf[0]-symbol.hinge[0]);let diff=((end-start+Math.PI*3)%(Math.PI*2))-Math.PI;for(let i=0;i<16;i++){const a=start+diff*i/16,b=start+diff*(i+1)/16;line([symbol.hinge[0]+Math.cos(a)*o.width,symbol.hinge[1]+Math.sin(a)*o.width],[symbol.hinge[0]+Math.cos(b)*o.width,symbol.hinge[1]+Math.sin(b)*o.width],.35);}}else if(o.kind==='window'){for(const side of [-1,1])line([a[0]-uy*w.thickness*.28*side,a[1]+ux*w.thickness*.28*side],[b[0]-uy*w.thickness*.28*side,b[1]+ux*w.thickness*.28*side],.7);line(a,b,.4);}else page.drawLine({start:pt(a),end:pt(b),thickness:.3,dashArray:[2,2],color:black});}

  for(const d of planDrawingDimensions(doc)){if(d.value<1)continue;const a=pt(d.a),b=pt(d.b),label=Math.round(d.value).toLocaleString('ru-RU')+' мм';page.drawLine({start:a,end:b,thickness:.3,dashArray:[1,1],color:black});if(d.kind==='room'){const p=dimensionLabelLayout(a,b,font.widthOfTextAtSize(label,6));page.drawText(label,{x:p.x,y:p.y,font,size:6,color:black,rotate:degrees(p.angle)});}else{const nx=-(d.b[1]-d.a[1])/d.value*75,ny=(d.b[0]-d.a[0])/d.value*75;for(const p of [d.a,d.b])line([p[0]-nx,p[1]-ny],[p[0]+nx,p[1]+ny],.5,black);const center={x:(a.x+b.x)/2,y:(a.y+b.y)/2},vertical=Math.abs(d.b[1]-d.a[1])>Math.abs(d.b[0]-d.a[0]);page.drawText(label,{x:vertical?center.x+4:center.x-font.widthOfTextAtSize(label,6)/2,y:vertical?center.y-2:center.y+4+Math.abs((d.b[1]-d.a[1])/(d.b[0]-d.a[0]||1))*font.widthOfTextAtSize(label,6)/2,font,size:6,color:black});}}
  for(const m of openingWidthMarks(doc,6/factor)){line(m.a,m.da,.2);line(m.b,m.db,.2);page.drawLine({start:pt(m.da),end:pt(m.db),thickness:.3,dashArray:[1,1],color:black});for(const p of [m.da,m.db])line([p[0]-m.nx*60,p[1]-m.ny*60],[p[0]+m.nx*60,p[1]+m.ny*60],.4);const p=pt([(m.da[0]+m.db[0])/2,(m.da[1]+m.db[1])/2]),vertical=Math.abs(m.db[1]-m.da[1])>Math.abs(m.db[0]-m.da[0]);page.drawText(m.label,{x:vertical?p.x+4:p.x-font.widthOfTextAtSize(m.label,6)/2,y:vertical?p.y-2:p.y+4,font,size:6,color:black});}
  const heights=planHeightLabels(doc);drawMeasuredNotes(page,font,[heights.common,...heights.walls.map(item=>`Стена № ${doc.walls.findIndex(w=>w.id===item.id)+1}: ${item.label}`),...notes],scale);for(const item of heights.walls){const w=doc.walls.find(w=>w.id===item.id)!,layout=heightLabelPosition(doc,w,item.label,6/factor),nx=layout.nx,ny=layout.ny,center:[number,number]=[layout.cx,layout.cy],at:[number,number]=[layout.x,layout.y];line([w.a[0]+nx*(w.thickness/2+50),w.a[1]+ny*(w.thickness/2+50)],[w.b[0]+nx*(w.thickness/2+50),w.b[1]+ny*(w.thickness/2+50)],.45,black);line(center,at,.3,black);const p=pt(at);page.drawText(item.label,{x:p.x-font.widthOfTextAtSize(item.label,6)/2,y:p.y+3,font,size:6,color:black});}
  for(const mark of wallNumberMarks(doc,6/factor)){const p=pt([mark.x,mark.y]),text=String(mark.number),width=font.widthOfTextAtSize(text,6);page.drawRectangle({x:p.x-mark.halfWidth*factor,y:p.y-mark.halfHeight*factor,width:mark.halfWidth*2*factor,height:mark.halfHeight*2*factor,color:white,borderColor:grey,borderWidth:.3});page.drawText(text,{x:p.x-width/2,y:p.y-2,font,size:6,color:black});}


  const bytes=await pdf.save();return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="measured-plan.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return new Response(e instanceof Error?e.message:'Не удалось сформировать PDF',{status:500});}
}
