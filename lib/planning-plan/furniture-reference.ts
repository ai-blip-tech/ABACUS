import type {FurnitureItem} from './furniture.ts';
export type FurnitureReference={name:string;image:string};
export function validateFurnitureReference(value:unknown):FurnitureReference{
 const r=value as FurnitureReference;
 if(!r||typeof r.name!=='string'||!r.name.trim()||r.name.length>240||typeof r.image!=='string'||r.image.length>250000||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(r.image))throw Error('Некорректный референс мебели');
 return {name:r.name,image:r.image};
}
export function furnitureReferencePatch(item:FurnitureItem,value:FurnitureReference):Partial<FurnitureItem>{
 return {reference:validateFurnitureReference(value),catalog:undefined,dimensionsSource:item.dimensionsSource==='user'?'user':'template'};
}
/** Only a bounded raster preview is stored; no upload to an AI service or dimension inference. */
export async function readFurnitureReference(file:File):Promise<FurnitureReference>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Выберите изображение JPG, PNG или WEBP');
 if(file.size>15*1024*1024)throw Error('Референс должен быть не больше 15 МБ');
 const url=URL.createObjectURL(file);
 try{
  const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('Не удалось прочитать изображение'));img.src=url;});
  if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>50000000)throw Error('Слишком большое изображение референса');
  const scale=Math.min(1,640/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Не удалось подготовить референс');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  let data=canvas.toDataURL('image/jpeg',.82);if(data.length>250000)data=canvas.toDataURL('image/jpeg',.5);
  return validateFurnitureReference({name:file.name.replace(/\.[^.]+$/,'').slice(0,240)||'Референс',image:data});
 }finally{URL.revokeObjectURL(url);}
}
