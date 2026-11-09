import type {MaterialNode,BoardPoint} from './model';
import {sourceImage,materialReference,blobImage} from './generation';

import {interiorEditPayload} from './interior-edit';
export {interiorEditPayload} from './interior-edit';
async function markedImage(source:string,point:BoardPoint){
 const bitmap=await createImageBitmap(await(await fetch(source)).blob()),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
 const c=canvas.getContext('2d');if(!c){bitmap.close();throw Error('Не удалось подготовить точку.');}c.drawImage(bitmap,0,0);bitmap.close();
 const x=canvas.width*point.x/100,y=canvas.height*point.y/100,r=Math.max(10,Math.min(canvas.width,canvas.height)*.018);
 c.strokeStyle='#fff';c.lineWidth=6;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();c.strokeStyle='#970e2d';c.lineWidth=3;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.moveTo(x-r*1.4,y);c.lineTo(x+r*1.4,y);c.moveTo(x,y-r*1.4);c.lineTo(x,y+r*1.4);c.stroke();return canvas.toDataURL('image/png');
}
export async function generateInteriorEdit(scene:MaterialNode,command:MaterialNode,operationId:string,signal:AbortSignal,projectId?:string|null){
 const payload=interiorEditPayload(scene,command);
 // Subsequent edits start from the current result; the original remains a separate saved source.
 payload.roomImage=await sourceImage({...scene,originalImage:scene.generated?undefined:scene.originalImage});payload.projectId=projectId||undefined;
 if('pointEdit' in payload&&payload.pointEdit){payload.pointEdit.markedImage=await markedImage(payload.roomImage,scene.editPoint!);payload.referenceImage=await materialReference(command);}
 const bitmap=await createImageBitmap(await(await fetch(payload.roomImage)).blob()),ratio=bitmap.width/bitmap.height;bitmap.close();
 const response=await fetch('/api/generate',{method:'POST',signal,headers:{'Content-Type':'application/json','Idempotency-Key':operationId,'X-Disable-Generation-Retry':'1'},body:JSON.stringify({...payload,outputSize:ratio>1.2?'1536x1024':ratio<.8?'1024x1536':'1024x1024'})});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.error||'Не удалось создать рендер.');}
 const image=await response.blob();if(!image.type.startsWith('image/')||!image.size)throw Error('Сервис не вернул готовое изображение.');return blobImage(image);
}
