import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {PassThrough} from 'node:stream';
import {basename,join} from 'node:path';
import {cabinetLibraryRoot} from '../lib/cabinet-library.mjs';
import JSZip from 'jszip';
import {Box3,Group,MeshStandardMaterial,Vector3} from 'three';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

const source = 'https://norrmobler.ru/upload/3dd/custom.zip';
const storage = process.env.ROOM_DESIGN_DATA_DIR || process.env.DATA_DIR;
if (!storage) throw Error('Укажите каталог данных Room Design в ROOM_DESIGN_DATA_DIR.');
const versions = cabinetLibraryRoot(storage);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

async function readLimited(chunks, limit) {
 const bytes = [];
 let size = 0;
 for await (const chunk of chunks) {
  size += chunk.length;
  if (size > limit) throw Error('Превышен допустимый размер архива или файла.');
  bytes.push(Buffer.from(chunk));
 }
 return Buffer.concat(bytes);
}

async function download() {
 const response = await fetch(source, {redirect:'error',signal:AbortSignal.timeout(120_000)});
 if (!response.ok || !response.body) throw Error('Поставщик не отдал архив: ' + response.status);
 return readLimited(response.body, 150 * 1024 ** 2);
}
const archivePath = process.argv[2];
const archive = archivePath ? await readLimited(createReadStream(archivePath), 150 * 1024 ** 2) : await download();
const formatVersion = 2;
const revision = digest(Buffer.concat([Buffer.from(String(formatVersion)),archive]));
const destination = join(versions, revision);

await mkdir(versions, {recursive:true});
async function activate() {
 const pointer = join(versions, '.current-' + process.pid);
 try {
  await writeFile(pointer, revision+'\n');
  await rename(pointer, join(versions,'current'));
 } finally {
  await rm(pointer,{force:true});
 }
}
try {
 const cached=JSON.parse(await readFile(join(destination,'manifest.json'),'utf8'));
 await activate();
 console.log(JSON.stringify({revision,directory:destination,models:cached.models.length,textures:cached.textures.length,bytes:cached.bytes}));
 process.exit(0);
} catch (error) {
 if (error.code !== 'ENOENT') throw error;
}

const zip = await JSZip.loadAsync(archive);
const entries = Object.values(zip.files).filter(entry=>!entry.dir);
if (entries.length > 500) throw Error('Слишком много файлов в архиве.');
const stage = await mkdtemp(join(versions,'.import-'));
function readEntry(entry, limit) {
 const source = entry.nodeStream('nodebuffer');
 const stream = new PassThrough();
 source.on('error', error => stream.destroy(error));
 stream.on('close', () => source.pause());
 source.pipe(stream);
 return readLimited(stream, limit);
}
const dimensions = box => box.getSize(new Vector3()).toArray().map(value=>Math.round(value*100)/100);
globalThis.window = {URL:{createObjectURL:()=>''}};
globalThis.FileReader = class {
 readAsArrayBuffer(blob) {
  blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});
 }
};

async function convertModel(bytes) {
 const root = new FBXLoader().parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 root.updateMatrixWorld(true);
 const box = new Box3().setFromObject(root);
 const [widthMm,heightMm,depthMm] = dimensions(box);
 if (![widthMm,heightMm,depthMm].every(n=>Number.isFinite(n)&&n>0)) throw Error('У модели нет габаритов.');
 const center = box.getCenter(new Vector3());
 const result = new Group();
 root.traverse(mesh=>{
  if (!mesh.isMesh) return;
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.translate(-center.x,-box.min.y,-center.z);
  geometry.scale(.001,.001,.001);
  const solid = mesh.clone();
  solid.geometry = geometry;
  const neutral = original => new MeshStandardMaterial({name:original.name,color:'#f4f1ec',roughness:.45});
  solid.material = Array.isArray(mesh.material) ? mesh.material.map(neutral) : neutral(mesh.material);
  solid.position.set(0,0,0);
  solid.rotation.set(0,0,0);
  solid.scale.set(1,1,1);
  solid.clear();
  result.add(solid);
 });
 if (!result.children.length) throw Error('В FBX нет геометрии.');
 const output = await new GLTFExporter().parseAsync(result,{binary:true});
 return {bytes:Buffer.from(output),widthMm,heightMm,depthMm};
}

try {
 const manifest = {formatVersion,revision,source,models:[],textures:[],bytes:0};
 const files = new Map();
 const models = new Map();
 async function addFile(name,bytes) {
  if (files.has(name)) return;
  await writeFile(join(stage,name),bytes);
  files.set(name,bytes.length);
  manifest.bytes += bytes.length;
 }
 for (const entry of entries.sort((a,b)=>a.name.localeCompare(b.name))) {
  if (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name) {
   throw Error('Некорректный путь в архиве поставщика.');
  }
  const name = entry.name.normalize('NFC');
  const model = /^custom\/(base|models)\/([\w-]+)\.fbx$/i.exec(name);
  if (model) {
   const [,directory,id] = model;
   const bytes = await readEntry(entry, 10 * 1024 ** 2);
   const hash = digest(bytes);
   if (models.has(id)) {
    if (models.get(id)!==hash) throw Error('Разные модели с одним артикулом: '+id);
    continue;
   }
   models.set(id,hash);
   const kind = directory==='base'?'support':'module';
   const {bytes:glb,...size}=await convertModel(bytes);
   const asset=id+'.glb';
   await addFile(asset,glb);
   manifest.models.push({id,kind,asset,...size});
  } else if (/^custom\/(?:texture\/|[^/]+\/DECORS\/).+\.jpe?g$/i.test(name)) {
   const bytes=await readEntry(entry, 20 * 1024 ** 2);
   if (bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255) throw Error('Некорректный JPEG: '+name);
   const asset=digest(bytes)+'.jpg';
   await addFile(asset,bytes);
   manifest.textures.push({name:basename(name),kind:name.startsWith('custom/texture/')?'glass':'ceramic',asset});
  }
 }
 if (!manifest.models.length || !manifest.textures.length) throw Error('Архив не содержит моделей или текстур.');
 await writeFile(join(stage,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 try {
  await rename(stage,destination);
 } catch (error) {
  if (!['EEXIST','ENOTEMPTY'].includes(error.code)) throw error;
  await readFile(join(destination,'manifest.json'));
 }
 await activate();
 console.log(JSON.stringify({revision,directory:destination,models:manifest.models.length,textures:manifest.textures.length,bytes:manifest.bytes}));
} finally {
 await rm(stage,{recursive:true,force:true});
}
