import {readFile,writeFile,mkdir,rm,stat,mkdtemp,rename} from 'node:fs/promises';import {join} from 'node:path';import {createHash} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import https from 'node:https';import {lookup} from 'node:dns/promises';
import {runtimeDataRoot} from './server-runtime';
const exec=promisify(execFile),pending=new Map<string,Promise<any>>();
export const modelCache=()=>join(runtimeDataRoot,'catalog-model-assets-v1');
async function download(raw:string,redirects=0):Promise<Buffer>{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.port&&!['443'].includes(url.port)||!['levehome.ru','www.levehome.ru','norrmobler.ru','www.norrmobler.ru'].includes(url.hostname))throw Error('Источник модели не поддерживается');const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(({address:ip})=>{if(ip.includes(':'))return (!/^[23][a-f0-9]{3}:/i.test(ip)||/^2001:db8:/i.test(ip));const [a,b]=ip.split('.').map(Number);return a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&b===168||a===100&&b>=64&&b<=127;}))throw Error('Недопустимый адрес источника');const address=addresses.find(a=>a.family===4)||addresses[0];return new Promise((resolve,reject)=>{const r=https.get(url,{lookup:((_h:any,o:any,cb:any)=>o?.all?cb(null,[address]):cb(null,address.address,address.family)) as any,timeout:20000},res=>{if([301,302,303,307,308].includes(res.statusCode||0)){res.resume();if(redirects>=2||!res.headers.location)return reject(Error('Ошибка перенаправления модели'));download(new URL(res.headers.location!,url).href,redirects+1).then(resolve,reject);return;}if(res.statusCode!==200){res.resume();return reject(Error('Модель поставщика недоступна'));}const chunks:Buffer[]=[];let size=0;res.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>100*1024*1024)return r.destroy(Error('Архив больше 100 МБ'));chunks.push(chunk);});res.on('end',()=>resolve(Buffer.concat(chunks)));res.on('error',reject);});r.on('timeout',()=>r.destroy(Error('Истекло время скачивания модели')));r.on('error',reject);});}
type ArchiveOptions = { inspect?: boolean; surfaceEditing?: boolean; textureId?: string };

export async function prepareCatalogModel(product:any, options:ArchiveOptions = {}) {
 const dimensions = [product.widthMm, product.heightMm, product.depthMm];
 const key = createHash('sha256').update(JSON.stringify([
  'v2', product.id, product.model3dUrl, dimensions, options.inspect ?? false, options.surfaceEditing ?? false, options.textureId ?? null,
 ])).digest('hex');
 const running = pending.get(key);
 if (running) return running;
 if (pending.size >= 2) throw Error('Конвертер занят. Повторите через несколько секунд.');
 const task = (async () => {
  const root = modelCache();
  const output = join(root, key + '.glb');
  await mkdir(root, {recursive:true});
  try {
   const report = JSON.parse(await readFile(output + '.json', 'utf8'));
   if (!options.inspect) await stat(output);
   return {key, ...report, cached:true};
  } catch { /* Regenerate incomplete cache entries. */ }
  const dir = await mkdtemp(join(root, 'conversion-'));
  try {
   const input = join(dir, 'source.archive');
   const converted = join(dir, 'model.glb');
   await writeFile(input, await download(product.model3dUrl));
   const toolsDir = join(process.cwd(), '.next', 'room-design-planner-tools');
   const script = process.env.ROOM_DESIGN_MODEL_CONVERTER || join(toolsDir, 'catalog-model-convert.mjs');
   const packagedArchiveTool = join(toolsDir, 'archive', 'bsdtar');
   const archiveTool = process.env.ROOM_DESIGN_ARCHIVE_TOOL || await stat(packagedArchiveTool).then(() => packagedArchiveTool, () => '/usr/bin/bsdtar');
   const {stdout} = await exec(process.execPath, [
    '--max-old-space-size=768', script, input, converted, JSON.stringify(dimensions),
    JSON.stringify({...options, productId:product.id}),
   ], {timeout:60000, maxBuffer:24*1024*1024, env:{NODE_ENV:process.env.NODE_ENV,ROOM_DESIGN_ARCHIVE_TOOL:archiveTool}});
   if (!options.inspect) await rename(converted, output);
   await rename(converted + '.json', output + '.json');
   return {key, ...JSON.parse(stdout), cached:false};
  } catch (error:any) {
   throw Error(String(error.stderr || error.message || 'Не удалось подготовить модель').slice(0,500));
  } finally {
   await rm(dir, {recursive:true,force:true});
  }
 })();
 pending.set(key, task);
 try { return await task; } finally { pending.delete(key); }
}
