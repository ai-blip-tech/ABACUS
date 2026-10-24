import {PDFDocument,rgb,degrees,type PDFFont} from 'pdf-lib';
import {albumFormat} from './album-format.ts';

const covered=new WeakSet<PDFDocument>();
export function coverTitleLines(name:string,font:PDFFont,width:number,size:number){
 const words=(name.replace(/[\u0000-\u001f\u007f]/g,' ').trim()||'Без названия').split(/\s+/),lines:string[]=[];let line='';
 for(const word of words){for(const char of (line?' '+word:word)){const next=line+char;if(font.widthOfTextAtSize(next,size)>width&&line){lines.push(line.trim());line=char.trim();}else line=next;}}
 if(line)lines.push(line.trim());return lines;
}
/** Shared, unnumbered front matter: add exactly once, before any project-stage sheets. */
export function addAlbumCover(pdf:PDFDocument,name:string,fonts:{sans:PDFFont;serif:PDFFont},year=new Date().getFullYear()){
 if(covered.has(pdf))return;covered.add(pdf);
 const {width:W,height:H}=albumFormat,page=pdf.insertPage(0,[W,H]),ink=rgb(.18,.105,.075),accent=rgb(.56,.025,.12),muted=rgb(.36,.30,.27),cream=rgb(.965,.95,.918),s=W/1672,base=80;
 const x=(v:number)=>v*s,y=(v:number)=>base+(941-v)*s;
 page.drawRectangle({x:0,y:0,width:W,height:H,color:cream});
 page.drawEllipse({x:x(653),y:y(675),xScale:517*s,yScale:517*s,borderColor:accent,borderWidth:1.25});
 const track=(text:string,left:number,top:number,size:number,gap:number,font=fonts.sans)=>{let at=x(left);for(const char of text){page.drawText(char,{x:at,y:y(top),font,size,color:ink});at+=font.widthOfTextAtSize(char,size)+gap;}};
 track('ROOM DESIGN',62,82,19,3.2,fonts.serif);
 track('ИНСТРУМЕНТ СОЗДАНИЯ ДИЗАЙН-ПРОЕКТА',62,122,9,2.4);
 page.drawText('R',{x:x(382),y:y(650),font:fonts.serif,size:480*s,color:ink});
 page.drawText('D',{x:x(625),y:y(812),font:fonts.serif,size:460*s,color:ink});
 const guide=(ax:number,ay:number,bx:number,by:number)=>page.drawLine({start:{x:x(ax),y:y(ay)},end:{x:x(bx),y:y(by)},thickness:.45,dashArray:[2,2],color:muted});
 guide(140,623,1205,623);guide(445,272,445,710);guide(720,316,720,846);guide(390,316,742,316);
 for(const ax of [181,416,946,1205]){guide(ax,604,ax,645);for(const dx of [-1,1])page.drawLine({start:{x:x(ax),y:y(623)},end:{x:x(ax+dx*6),y:y(620)},thickness:.5,color:muted});}
 for(const [text,left] of [['3 050 мм',270],['3 542 мм',787],['2 537 мм',1036]] as const)page.drawText(text,{x:x(left),y:y(612),font:fonts.sans,size:9,color:muted});
 page.drawText('2 697 мм',{x:x(709),y:y(455),font:fonts.sans,size:9,color:muted,rotate:degrees(90)});
 const right=x(1202),titleSize=30;
 page.drawText('ДИЗАЙН-ПРОЕКТ',{x:right,y:y(355),font:fonts.serif,size:titleSize,color:ink});
 page.drawText('ИНТЕРЬЕРА',{x:right,y:y(412),font:fonts.serif,size:titleSize,color:ink});
 page.drawLine({start:{x:right,y:y(450)},end:{x:right+56,y:y(450)},thickness:1.2,color:accent});
 const title=name.trim()||'Без названия',size=11,lines=coverTitleLines(title,fonts.sans,W-right-40,size);
 lines.forEach((line,i)=>page.drawText(line,{x:right,y:y(495)-i*17,font:fonts.sans,size,color:ink}));
 page.drawText(String(year),{x:right,y:y(495)-lines.length*17-10,font:fonts.sans,size:10,color:muted});
 page.drawLine({start:{x:right,y:y(789)},end:{x:right+36,y:y(789)},thickness:1.2,color:accent});
 track('УВИДЕТЬ ПРОСТРАНСТВО ИНАЧЕ.',1202,824,8,1.5);
 track('www.roomdesign.com.ru',692,904,9,2.1);
 return page;
}
