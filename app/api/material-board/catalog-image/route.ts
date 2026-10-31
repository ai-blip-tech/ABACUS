import {loadStudioCatalog} from '@/lib/studio-catalog';

export const runtime='nodejs';
const allowed=(url:URL)=>url.protocol==='https:'&&!url.username&&!url.password&&(!url.port||url.port==='443')&&['norrmobler.ru','levehome.ru','rom-divan.ru','gomoon.ru'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
/** Public catalogue photo only: no arbitrary URL or authenticated user assets. */
export async function GET(request:Request){
 const id=new URL(request.url).searchParams.get('id');if(!id||id.length>220)return Response.json({error:'Укажите товар каталога.'},{status:400});
 try{
  const {products}=await loadStudioCatalog(),product=products.find(p=>p.id===id);if(!product?.image)return Response.json({error:'Товар не найден в каталоге.'},{status:404});
  let url=new URL(product.image),response:Response|undefined;
  const signal=AbortSignal.timeout(20000);
  for(let i=0;i<4;i++){if(!allowed(url))throw Error('Источник фото не поддерживается.');response=await fetch(url,{redirect:'manual',signal,headers:{Accept:'image/png,image/jpeg,image/webp','User-Agent':'ROOM-design-catalog/1.0'}});if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');if(!location)throw Error('Некорректный ответ каталога.');await response.body?.cancel();url=new URL(location,url);continue;}break;}
  if(!response?.ok||!response.body)throw Error('Не удалось загрузить фото товара.');
  const type=(response.headers.get('content-type')||'').split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(type))throw Error('Неподдерживаемый формат фото товара.');
  const chunks:Uint8Array[]=[];let size=0;const reader=response.body.getReader();for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>20_000_000){await reader.cancel();throw Error('Фото товара превышает 20 МБ.');}chunks.push(part.value);}if(!size)throw Error('Пустое фото товара.');
  const image=new Uint8Array(size);let offset=0;for(const chunk of chunks){image.set(chunk,offset);offset+=chunk.length;}
  return new Response(image,{headers:{'Content-Type':type,'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Не удалось подготовить фото каталога.'},{status:502});}
}
