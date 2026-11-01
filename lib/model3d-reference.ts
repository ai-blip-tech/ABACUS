import https from 'node:https';
import { lookup } from 'node:dns/promises';
import sharp from 'sharp';
import { loadStudioCatalog } from './studio-catalog';

const MAX = 10 * 1024 * 1024;
function publicAddress(ip: string) {
  if (ip.includes(':')) return /^[23][a-f0-9]{3}:/i.test(ip) && !/^2001:db8:/i.test(ip);
  const [a,b] = ip.split('.').map(Number);
  return a>0 && a<224 && a!==10 && a!==127 && !(a===169&&b===254) && !(a===172&&b>=16&&b<=31) && !(a===192&&b===168) && !(a===100&&b>=64&&b<=127);
}
async function catalogImage(url: string, redirects=0): Promise<Buffer> {
  const target=new URL(url);
  const hosts=(process.env.MODEL3D_IMAGE_HOSTS || 'norrmobler.ru,www.norrmobler.ru,leve-home.ru,www.leve-home.ru,levehome.ru,www.levehome.ru,gomoon.ru,www.gomoon.ru').split(',').map(x=>x.trim());
  if(target.protocol!=='https:'||target.username||target.password||target.port&&target.port!=='443'||!hosts.includes(target.hostname))throw Error('Домен фото каталога не настроен для сервиса 3D.');
  const addresses=await lookup(target.hostname,{all:true});
  if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Некорректный адрес фото.');
  const address=addresses.find(a=>a.family===4)||addresses[0];
  return new Promise((resolve,reject)=>{
    const request=https.get(target,{lookup:(_hostname,_options,callback)=>callback(null,address.address,address.family),timeout:15000},response=>{
      if([301,302,303,307,308].includes(response.statusCode||0)) {
        response.resume();
        if(redirects>=2||!response.headers.location){reject(Error('Не удалось загрузить фото каталога.'));return;}
        catalogImage(new URL(response.headers.location,target).toString(),redirects+1).then(resolve,reject);return;
      }
      if(response.statusCode!==200){response.resume();reject(Error('Фото каталога недоступно.'));return;}
      const chunks:Buffer[]=[];let size=0;
      response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>MAX){request.destroy(Error('Фото больше 10 МБ.'));return;}chunks.push(chunk);});
      response.on('end',()=>resolve(Buffer.concat(chunks)));response.on('error',reject);
    });
    request.on('timeout',()=>request.destroy(Error('Истекло время загрузки фото.')));request.on('error',reject);
  });
}
export async function prepareModelReference(input: Record<string,unknown>) {
  let bytes:Buffer;
  if(typeof input.catalogProductId==='string') {
    const {products}=await loadStudioCatalog();
    const product=products.find(p=>p.id===input.catalogProductId);
    if(!product?.image)throw Error('Товар с фотографией не найден.');
    bytes=await catalogImage(product.image);
    input.name=product.name;
  }else{
    const source=input.imageDataUrl;
    if(typeof source!=='string'||source.length>14*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(source))throw Error('Нужен JPG, PNG или WEBP до 10 МБ.');
    bytes=Buffer.from(source.slice(source.indexOf(',')+1),'base64');
    if(bytes.length>MAX)throw Error('Фото больше 10 МБ.');
  }
  // Decode, orient and normalize on the trusted server before hashing/caching.
  const png=await sharp(bytes,{limitInputPixels:16_000_000,animated:false}).rotate().resize(2048,2048,{fit:'inside',withoutEnlargement:true}).png().toBuffer();
  if(png.length>MAX)throw Error('Референс слишком большой.');
  return {name:input.name,widthMm:input.widthMm,depthMm:input.depthMm,heightMm:input.heightMm,resolution:input.resolution,imageBase64:png.toString('base64')};
}
