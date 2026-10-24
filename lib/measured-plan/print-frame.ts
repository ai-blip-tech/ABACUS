import {degrees,rgb,type PDFPage,type PDFFont} from 'pdf-lib';
import reference from './print-frame-reference.json';

// Frame geometry and static label baselines digitised from the supplied NORR A3 sheet.
// Only blank form geometry is retained, never the reference drawing, signatures or project data.
export const sheetFormat={width:reference.width,height:reference.height};
export function drawMeasuredFrame(page:PDFPage,font:PDFFont){
 const color=rgb(0,0,0);
 for(const [x,y,x2,y2,width] of reference.segments)page.drawLine({start:{x,y},end:{x:x2,y:y2},thickness:width,color});
 for(const [text,x,y,size,angle] of reference.characters as [string,number,number,number,number][])page.drawText(text,{x,y,font,size,rotate:degrees(angle),color});
 const title='Обмерный план';page.drawText(title,{x:(836.1792+1147.957-font.widthOfTextAtSize(title,20))/2,y:29,font,size:20,color});
 page.drawText('1',{x:(1147.957+1176.3004-font.widthOfTextAtSize('1',8))/2,y:23,font,size:8,color});
}
export function drawMeasuredNotes(page:PDFPage,font:PDFFont,notes:string[],scale:number){
 const color=rgb(0,0,0),x=681,y=184,size=9;
 page.drawText('ПРИМЕЧАНИЯ:',{x,y,font,size,color});
 const lines=['Все размеры уточняются замером.','Цифры в рамках - номера стен.',...notes,`Масштаб 1:${scale}. Размеры в миллиметрах.`];
 let at=y-14;
 for(const line of lines){let part='';for(const word of line.split(' ')){const next=part?part+' '+word:word;if(font.widthOfTextAtSize(next,size)>470&&part){page.drawText(part,{x:x+14,y:at,font,size,color});at-=13;part=word;}else part=next;}if(part){page.drawText(part,{x:x+14,y:at,font,size,color});at-=13;}}
}
