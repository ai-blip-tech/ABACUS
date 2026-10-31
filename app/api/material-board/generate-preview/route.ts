import {imageModel} from '@/lib/image-model';
import {openAIKey} from '@/lib/server-config';

export const runtime='nodejs';
const MAX_IMAGE_BYTES=15*1024*1024;
const allowedSizes=new Set(['1024x1024','1536x1024','1024x1536']);

function isLoopback(request:Request){
 const url=new URL(request.url),headerHost=request.headers.get('host')||url.host,host=headerHost.startsWith('[')?headerHost.slice(1,headerHost.indexOf(']')):headerHost.split(':')[0];
 if(process.env.NODE_ENV==='production'||!['127.0.0.1','localhost','::1'].includes(host))return false;
 const origin=request.headers.get('origin');
 if(!origin)return true;
 try{const originUrl=new URL(origin),originHost=originUrl.hostname.replace(/^\[|\]$/g,'');return ['127.0.0.1','localhost','::1'].includes(originHost)&&(!originUrl.port||originUrl.port===headerHost.split(':').at(-1));}catch{return false;}
}

function dataImage(value:unknown,label:string){
 if(typeof value!=='string')throw Error(`Не найдено изображение: ${label}.`);
 const match=value.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
 if(!match)throw Error(`Неподдерживаемое изображение: ${label}.`);
 const bytes=Uint8Array.from(atob(match[2]),character=>character.charCodeAt(0));
 if(!bytes.byteLength||bytes.byteLength>MAX_IMAGE_BYTES)throw Error(`${label}: допустимо не более 15 МБ.`);
 return new Blob([bytes],{type:match[1]});
}

export async function POST(request:Request){
 if(!isLoopback(request))return Response.json({error:'Локальная генерация недоступна.'},{status:404});
 const key=openAIKey();
 if(!key)return Response.json({error:'API OpenAI не подключён к локальному превью.'},{status:503});
 try{
  const length=Number(request.headers.get('content-length')||0);if(length>45*1024*1024)throw Error('Запрос превышает допустимый размер.');
  const body=await request.json() as {prompt?:unknown;roomImage?:unknown;templateEdit?:{templateId?:unknown;instructions?:unknown;referenceImages?:unknown};outputSize?:unknown};
  const prompt=typeof body.templateEdit?.instructions==='string'?body.templateEdit.instructions:typeof body.prompt==='string'?body.prompt:'';
  if(!prompt.trim()||prompt.length>32_000)throw Error('Некорректное описание изменения материала.');
  const references=Array.isArray(body.templateEdit?.referenceImages)?body.templateEdit.referenceImages:[];
  const templateId=body.templateEdit?.templateId,moodboard=templateId==='moodboard-builder',planogram=templateId==='planogram-3d',sources=[body.roomImage,...references];
  if(moodboard?sources.length<2||sources.length>16:planogram?references.length>10:references.length!==1)throw Error(moodboard?'Для moodboard выберите от 2 до 16 изображений.':planogram?'Для планограммы 3D допустимо не более 10 референсов.':'Для генерации нужен один образец материала.');
  const images=sources.map((source,index)=>dataImage(source,moodboard?`референс ${index+1}`:planogram?index?`референс ${index}`:'планировка':index?'материал':'товар'));
  const size=typeof body.outputSize==='string'&&allowedSizes.has(body.outputSize)?body.outputSize:'1024x1024';
  const providerPrompt=moodboard?['Create one premium vertical editorial material moodboard from all supplied source images.',`Images 1–${images.length} are equal material and visual references. There is no primary room image and no image may be treated as an architectural scene to preserve.`,'Represent every supplied reference exactly once as a recognisable physical sample. Preserve its actual dominant colours, pattern, grain, weave, pile, reflectivity and surface character; never substitute or invent a material that is not visible in the inputs.','Arrange the samples as a tactile, professionally art-directed flat-lay on a warm ivory background. Use varied sample shapes and scales, controlled overlaps, balanced asymmetry, soft directional daylight and believable contact shadows.',prompt,'Do not create an interior room, furniture scene, digital grid, row of identical cards, technical catalogue, text, labels, logos, hands, people or watermark.','Return exactly one coherent full-frame moodboard.'].join('\n'):planogram?['Create exactly one photorealistic three-dimensional floor plan from Image 1.','IMAGE 1 IS THE AUTHORITATIVE FLOOR PLAN. Preserve its outer contour, room count, room shapes, wall positions and thicknesses, windows, doors and swing directions, openings, stairs, balconies, entrances, plumbing zones, orientation and relative proportions. Dimension annotations in Image 1 have priority over visual estimation.','MANDATORY DOOR PARSING: mentally erase every thin curved swing arc. It is metadata only and contributes zero physical geometry. Render every ordinary doorway with exactly one closed straight leaf flush inside its wall opening.','The camera must be perfectly orthographic and directly overhead: strict 90-degree bird’s-eye top-down view, open ceiling, no perspective tilt, no isometric angle and no visible exterior wall faces.',references.length?`Images 2–${references.length+1} are style, material and furniture references only. Never copy their architecture or layout.`:'There are no supporting references.','Every structured control in the user brief is mandatory. Style and furnishing choices may change contents and finishes but never the locked architecture.',prompt,'Show the complete uncropped plan once. No split screen, diagrams, labels, dimensions, text, logos, borders or watermark.'].join('\n'):prompt;
  const form=new FormData();form.append('model',imageModel());form.append('prompt',providerPrompt);images.forEach((image,index)=>form.append('image[]',image,`${moodboard?'moodboard-reference-'+(index+1):planogram?index?'planogram-reference-'+index:'authoritative-floor-plan':index?'material-target':'product-base'}.${image.type.split('/')[1]}`));form.append('size',size);form.append('quality','medium');form.append('output_format','webp');
  const response=await fetch('https://api.openai.com/v1/images/edits',{method:'POST',headers:{Authorization:`Bearer ${key}`},body:form,signal:AbortSignal.timeout(180_000)});
  const payload=await response.json().catch(()=>({})) as {data?:Array<{b64_json?:string}>;error?:{message?:string}};
  if(!response.ok)return Response.json({error:payload.error?.message||`Сервис генерации вернул код ${response.status}.`},{status:response.status});
  const encoded=payload.data?.[0]?.b64_json;if(!encoded)throw Error('Модель не вернула готовое изображение.');
  const result=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));if(!result.byteLength)throw Error('Модель вернула пустое изображение.');
  return new Response(result,{headers:{'Content-Type':'image/webp','Cache-Control':'no-store','X-Room-AI-Model':imageModel(),'X-Room-AI-Scope':'local-material-preview'}});
 }catch(error){const timeout=error instanceof Error&&(error.name==='TimeoutError'||error.name==='AbortError');return Response.json({error:timeout?'Генерация заняла больше трёх минут. Попробуйте ещё раз.':error instanceof Error?error.message:'Не удалось создать вариант материала.'},{status:timeout?504:400});}
}
