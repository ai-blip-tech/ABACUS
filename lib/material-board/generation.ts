import type {MaterialNode} from './model';

export const MATERIAL_TRANSFER_VERSION='material-board-transfer-v1';
export const MOODBOARD_COMPOSITION_VERSION='moodboard-builder-v1';
export type Planogram3DValues={designBrief:string;style:string;furnishing:string;existingFurniture:string;lighting:string;atmosphere:string;peopleCount:string;peopleBehavior:string;detail:string;wallMode:string;wallDimensions:string;environment:string;resultFormat:string};
export function materialTransferInstruction(product:MaterialNode,material:MaterialNode){return[
 'PRODUCT_BASE is image 1: the original product photograph. MATERIAL_TARGET is image 2: a colour or material sample, never an object to insert.',
 `Task: change only the upholstery/surface finish of the single existing product (${JSON.stringify(product.title)}) to the supplied target.`,
 material.kind==='colour'?`Colour target: ${material.title}; approximate screen swatch ${material.colour||''}. Match the colour sample while retaining the original upholstery texture, weave, seams and realistic lighting. Do not turn upholstery into a flat colour patch.`:`Material target: ${JSON.stringify(material.title)}. Transfer only its texture, pattern, colour and finish to the existing upholstered surfaces.`,
 'Preserve the exact product identity, silhouette, proportions, geometry, seams, cushions, camera, framing, background and contact shadows. Keep legs, hardware and other non-upholstered parts unchanged unless the source product itself is entirely that material.',
 'The result is a product photograph, not a moodboard. Do not add labels, swatches, new furniture, text, logos, marks, borders, people, split views or before/after panels.',
 'Return one complete image. Use the material sample only as visual guidance; do not reproduce its card or create an additional object.',
].join('\n');}
export function blobImage(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Не удалось прочитать изображение.'));reader.readAsDataURL(blob);});}
export async function sourceImage(node:MaterialNode){
 const image=node.originalImage||node.image;if(!image)throw Error('Сначала загрузите изображение товара.');
 if(image.startsWith('data:image/'))return image;
 const url=node.catalogId?'/api/material-board/catalog-image?id='+encodeURIComponent(node.catalogId):image;
 const response=await fetch(url,{credentials:url.startsWith('/')?'same-origin':'omit'});
 if(!response.ok)throw Error('Не удалось подготовить изображение из каталога. Загрузите фото товара с компьютера.');
 const blob=await response.blob();if(!blob.type.startsWith('image/')||!blob.size||blob.size>20_000_000)throw Error('Источник не вернул поддерживаемое изображение.');
 return blobImage(blob);
}
export async function materialReference(node:MaterialNode){
 if(node.image)return sourceImage(node);
 const canvas=document.createElement('canvas');canvas.width=canvas.height=768;const c=canvas.getContext('2d');if(!c)throw Error('Не удалось подготовить образец цвета.');
 c.fillStyle=node.colour||'#c4b394';c.fillRect(0,0,768,768);
 if(node.pattern){
  const step=node.pattern==='wood'?9:node.pattern==='metal'?3:6;
  for(let p=0;p<768;p+=step){c.strokeStyle=p%2?'#ffffff20':'#00000015';c.lineWidth=1;c.beginPath();c.moveTo(p,0);c.lineTo(p+(node.pattern==='wood'?22:0),768);c.stroke();if(['linen','boucle','leather'].includes(node.pattern)){c.beginPath();c.moveTo(0,p);c.lineTo(768,p);c.stroke();}}
 }
 return canvas.toDataURL('image/png');
}
async function compactReference(node:MaterialNode){
 const source=await materialReference(node),bitmap=await createImageBitmap(await(await fetch(source)).blob()),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const context=canvas.getContext('2d');if(!context){bitmap.close();throw Error('Не удалось подготовить референс для moodboard.');}context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();return canvas.toDataURL('image/webp',.9);
}
export const moodboardCompositionInstruction=[
 'Собрать из всех переданных изображений один цельный профессиональный material moodboard.',
 'Каждый исходный материал или товар должен остаться узнаваемым по реальному цвету, рисунку, зерну, ворсу, блеску, форме и фактуре; не подменять образцы и не придумывать отсутствующие материалы.',
 'Композиция: премиальный editorial flat-lay на тёплом светлом фоне. Физические образцы разной формы и масштаба частично перекрывают друг друга, с мягким направленным дневным светом и естественными контактными тенями.',
 'Можно добавить только небольшие неподписанные цветовые выкрасы, извлечённые из переданных материалов.',
 'Не создавать комнату, цифровую сетку, ряд одинаковых карточек, технический каталог, текст, подписи, логотипы, руки, людей или водяные знаки.',
 'Вернуть ровно один цельный вертикальный moodboard в полном кадре.',
].join(' ');
export async function generateMoodboard(nodes:MaterialNode[],operationId:string,signal:AbortSignal){
 if(nodes.length<2||nodes.length>16)throw Error('Для moodboard выберите от 2 до 16 материалов и референсов.');
 const images=await Promise.all(nodes.map(compactReference)),localPreview=['127.0.0.1','localhost','::1'].includes(location.hostname),endpoint=localPreview?'/api/material-board/generate-preview':'/api/generate';
 const response=await fetch(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json','Idempotency-Key':operationId,'X-Disable-Generation-Retry':'1'},body:JSON.stringify({operation:'global_edit',prompt:`[template:moodboard-to-room; output:Материальный moodboard] ${moodboardCompositionInstruction}`,roomImage:images[0],templateEdit:{templateId:'moodboard-builder',instructions:moodboardCompositionInstruction,referenceImages:images.slice(1),outputLabel:'Материальный moodboard'},outputSize:'1024x1536'})});
 if(!response.ok){const payload=await response.json().catch(()=>({}));throw Error(payload.error||'Не удалось собрать moodboard.');}
 const image=await response.blob();if(!image.type.startsWith('image/')||!image.size)throw Error('Сервис не вернул изображение moodboard.');return blobImage(image);
}
const planogram3DBrief='FLOOR PLAN LOCK. Превратить исходную плоскую планировку в один максимально фотореалистичный объёмный 3D-план строго сверху. Неприкосновенно сохранить внешний контур, ориентацию, количество, форму и пропорции помещений, все стены и перегородки, окна, дверные проёмы, лестницы, балконы, лоджии, санузлы и входную группу. Перед рендером мысленно удалить все тонкие дуги открывания дверей: дуга является только условным обозначением траектории. В финальном изображении все двери показывать закрытыми и строго в плоскости стенового проёма. Камера строго ортографическая сверху: без перспективного наклона, без изометрии и без закрытого потолка. Референсы использовать только для стиля, материалов и предметов, никогда не переносить из них планировку. Не добавлять и не удалять помещения, стены, окна или дверные проёмы; не обрезать объект. Вернуть одно статичное изображение без подписей, логотипов и водяных знаков.';
export async function generatePlanogram3D(planImage:string,references:MaterialNode[],values:Planogram3DValues,operationId:string,signal:AbortSignal){
 if(references.length>10)throw Error('Для планограммы 3D можно выбрать не более 10 референсов.');
 const referenceImages=await Promise.all(references.map(compactReference)),bitmap=await createImageBitmap(await(await fetch(planImage)).blob()),ratio=bitmap.width/bitmap.height;bitmap.close();
 const outputSize=values.resultFormat==='Квадратный'?'1024x1024':values.resultFormat==='Вертикальный'?'1024x1536':values.resultFormat==='Горизонтальный'?'1536x1024':ratio<.87?'1024x1536':ratio<=1.15?'1024x1024':'1536x1024';
 const controls=[`MANDATORY STYLE: ${values.style}.`,`MANDATORY FURNISHING DENSITY: ${values.furnishing}.`,`MANDATORY EXISTING-FURNITURE POLICY: ${values.existingFurniture}.`,`MANDATORY LIGHTING: ${values.lighting}; atmosphere: ${values.atmosphere}.`,values.peopleCount==='Без людей'?'MANDATORY PEOPLE: render no people.':`MANDATORY PEOPLE: render ${values.peopleCount}; behaviour: ${values.peopleBehavior}. Do not omit them.`,`MANDATORY DETAIL: ${values.detail}.`,`MANDATORY WALL MODE: ${values.wallMode}${values.wallDimensions?`; dimensions: ${values.wallDimensions}`:''}.`,`MANDATORY ENVIRONMENT: ${values.environment}.`,values.designBrief?`USER DESIGN BRIEF: ${values.designBrief}.`:''].filter(Boolean).join('\n');
 const localPreview=['127.0.0.1','localhost','::1'].includes(location.hostname),endpoint=localPreview?'/api/material-board/generate-preview':'/api/generate';
 const response=await fetch(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json','Idempotency-Key':operationId,'X-Disable-Generation-Retry':'1'},body:JSON.stringify({operation:'global_edit',prompt:`[template:planogram-3d] ${planogram3DBrief}`,roomImage:planImage,templateEdit:{templateId:'planogram-3d',instructions:`${planogram3DBrief}\n${controls}`,referenceImages,outputLabel:'Планограмма 3D'},outputSize})});
 if(!response.ok){const payload=await response.json().catch(()=>({}));throw Error(payload.error||'Не удалось создать планограмму 3D.');}
 const image=await response.blob();if(!image.type.startsWith('image/')||!image.size)throw Error('Сервис не вернул изображение планограммы 3D.');return blobImage(image);
}
/** Uses the existing authenticated Room Design generation/billing pipeline. */
export async function generateMaterialTransfer(product:MaterialNode,material:MaterialNode,operationId:string,signal:AbortSignal){
 const [roomImage,referenceImage]=await Promise.all([sourceImage(product),materialReference(material)]);
 const base=await createImageBitmap(await(await fetch(roomImage)).blob()),ratio=base.width/base.height; base.close();
 const outputSize=ratio>1.2?'1536x1024':ratio<.8?'1024x1536':'1024x1024';
 const instruction=materialTransferInstruction(product,material);
 const localPreview=['127.0.0.1','localhost','::1'].includes(location.hostname),endpoint=localPreview?'/api/material-board/generate-preview':'/api/generate';
 const response=await fetch(endpoint,{method:'POST',signal,headers:{'Content-Type':'application/json','Idempotency-Key':operationId,'X-Disable-Generation-Retry':'1'},body:JSON.stringify({operation:'global_edit',prompt:instruction,roomImage,templateEdit:{templateId:'material-board-transfer',instructions:instruction,referenceImages:[referenceImage],outputLabel:'Товар · '+material.title},outputSize})});
 if(!response.ok){const payload=await response.json().catch(()=>({}));throw Error(payload.error||(response.status===401?'Для генерации войдите в Room Design.':'Не удалось изменить материал товара.'));}
 const image=await response.blob();if(!image.type.startsWith('image/')||!image.size)throw Error('Сервис не вернул изображение. Исходный товар сохранён.');
 return blobImage(image);
}
