import sharp from 'sharp';
export type TileTextureReport={status:'ready'|'unsuitable';reason:string;sourceWidth:number;sourceHeight:number;crop?:{left:number;top:number;width:number;height:number};rotation?:number;width?:number;height?:number};
/** Conservative rectangular slab extraction, not a texture synthesizer. Ambiguous photos are rejected. */
export async function prepareTileTexture(input:Buffer,widthMm:number,heightMm:number){
 const image=sharp(input,{limitInputPixels:16_000_000}).rotate(),{data,info}=await image.clone().ensureAlpha().raw().toBuffer({resolveWithObject:true}),{width:w,height:h,channels}=info;
 const fail=(reason:string):{report:TileTextureReport;bytes?:Buffer}=>({report:{status:'unsuitable',reason,sourceWidth:w,sourceHeight:h}});
 if(![widthMm,heightMm].every(n=>Number.isFinite(n)&&n>=10&&n<=10000))return fail('Не указан достоверный формат плиты');
 const rows=new Uint32Array(h),cols=new Uint32Array(w);let foreground=0;
 const material=(i:number)=>data[i+3]>240&&!(Math.min(data[i],data[i+1],data[i+2])>=243&&Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<=12);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(material((y*w+x)*channels)){rows[y]++;cols[x]++;foreground++;}
 if(foreground<w*h*.03)return fail('Белая плита неотделима от белого фона: нужна подготовленная текстура');
 let left=0,right=w-1,top=0,bottom=h-1;while(left<right&&cols[left]<h*.015)left++;while(right>left&&cols[right]<h*.015)right--;while(top<bottom&&rows[top]<w*.015)top++;while(bottom>top&&rows[bottom]<w*.015)bottom--;
 const cw=right-left+1,ch=bottom-top+1,crop={left,top,width:cw,height:ch};
 if(Math.min(cw,ch)<128)return fail('Изображение самой плиты меньше 128 пикселей по короткой стороне');
 let occupied=0;for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)if(material((y*w+x)*channels))occupied++;
 if(occupied/(cw*ch)<.82)return fail('Внутри изображения остаются фон, разделители или несколько образцов');
 const ratio=cw/ch,expected=widthMm/heightMm,straight=Math.abs(Math.log(ratio/expected)),turned=Math.abs(Math.log((1/ratio)/expected)),rotation=turned<straight?90:0;
 if(Math.min(straight,turned)>Math.log(1.06))return fail('Пропорции фотографии не совпадают с форматом плиты; возможны интерьерное фото или коллаж');
 const cropped=await sharp(data,{raw:{width:w,height:h,channels:4}}).extract(crop).png().toBuffer();
 const bytes=await sharp(cropped).rotate(rotation).resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).jpeg({quality:94}).toBuffer(),metadata=await sharp(bytes).metadata();
 return{report:{status:'ready',reason:left||top||right<w-1||bottom<h-1?'Белые поля удалены; ориентация сверена с форматом плиты':'Прямоугольное изображение плиты; формат проверен',sourceWidth:w,sourceHeight:h,crop,rotation,width:metadata.width,height:metadata.height} as TileTextureReport,bytes};
}
