import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import {archiveTextureChoices,embedArchiveTexture,textureMime} from './catalog-archive-textures.mjs';
import {posix} from 'node:path';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {MTLLoader} from 'three/addons/loaders/MTLLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Box3,Vector3,Group,MeshStandardMaterial} from 'three';
const exec=promisify(execFile);
const archiveTool = process.env.ROOM_DESIGN_ARCHIVE_TOOL || '/usr/bin/bsdtar';
globalThis.FileReader=class{readAsArrayBuffer(b){b.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
export function safeMembers(list){const names=list.trim().split('\n').filter(Boolean);if(names.length>2000||names.some(n=>n.length>500||n.startsWith('/')||n.includes('\\')||n.split('/').includes('..')||/^[A-Za-z]:/.test(n)))throw Error('Небезопасная структура архива');return names;}
export async function convertArchive(input,output,dimensions,options={}){
 const start=Date.now();const list=await exec(archiveTool,['-tf',input],{timeout:10000,maxBuffer:1024*1024});const names=safeMembers(list.stdout);
 const detail=await exec(archiveTool,['-tvf',input],{timeout:10000,maxBuffer:2*1024*1024});if(detail.stdout.split('\n').some(l=>l&&!['-','d'].includes(l[0])))throw Error('Ссылки и специальные файлы в архиве не поддерживаются');
 let total=0;const extract=async name=>{if(!names.includes(name))throw Error('Файл модели отсутствует');const {stdout}=await exec(archiveTool,['-xOf',input,'--',name],{encoding:'buffer',timeout:15000,maxBuffer:100*1024*1024});total+=stdout.length;if(total>200*1024*1024)throw Error('Распакованная модель слишком большая');return stdout;};
 const objs=names.filter(n=>/\.obj$/i.test(n));if(objs.length!==1)throw Error(objs.length?'В архиве несколько OBJ: требуется выбор модели':'В архиве нет OBJ. Для MAX нужен экспорт в OBJ или GLB');
 const name=objs[0],text=(await extract(name)).toString('utf8');if((text.match(/^f /gm)||[]).length>1000000)throw Error('Слишком сложная модель');
 const lib=text.match(/^mtllib\s+(.+)$/m)?.[1]?.trim(),mtlPath=lib?posix.normalize(posix.join(posix.dirname(name),lib)):null;
 const rawMaterials = mtlPath && names.includes(mtlPath) ? (await extract(mtlPath)).toString('utf8') : '';
 const choices = archiveTextureChoices(names, name, rawMaterials, options.productId, options.surfaceEditing);
 if (options.inspect) {
   const textures = [];
   for (const choice of choices) {
     const image = await extract(choice.path);
     if (image.length > 1024 * 1024) continue;
     try {
       textures.push({id:choice.id,label:choice.label,image:`data:${textureMime(image)};base64,${image.toString('base64')}`});
     } catch { /* Skip unsupported image data. */ }
   }
   return {textures};
 }
 const texture = options.textureId ? choices.find(choice => choice.id === options.textureId) : undefined;
 if (options.textureId && !texture) throw Error('Текстура отсутствует в архиве модели');
 let materials;
 if (rawMaterials) {
   materials = new MTLLoader().parse(rawMaterials.replace(/^\s*(?:map_\w+|bump|disp|decal)\s+.*$/gim,''),'');
   materials.preload();
 }
 const loader=new OBJLoader();if(materials)loader.setMaterials(materials);let model=loader.parse(text),variants=1;const children=[...model.children],clusters=[];for(const child of children){const box=new Box3().setFromObject(child).expandByScalar(.025),hits=clusters.filter(c=>c.box.intersectsBox(box));if(!hits.length)clusters.push({box,items:[child]});else{const c=hits[0];c.box.union(box);c.items.push(child);for(const other of hits.slice(1)){c.box.union(other.box);c.items.push(...other.items);clusters.splice(clusters.indexOf(other),1);}}}if(clusters.length>1){const sizes=clusters.map(c=>c.box.getSize(new Vector3()).toArray());if(sizes.some(s=>s.some((v,i)=>Math.abs(v/sizes[0][i]-1)>.05)))throw Error('В OBJ несколько разных моделей: требуется выбор варианта');variants=clusters.length;const chosen=new Group();for(const n of clusters[0].items)chosen.add(n);model=chosen;}let triangles=0,meshes=0,unassigned=false;
 model.traverse(n=>{if(!n.isMesh)return;meshes++;triangles+=(n.geometry.index?n.geometry.index.count:n.geometry.attributes.position.count)/3;const convert=m=>{const wire=/^wire_/i.test(m.name||'');unassigned ||=wire;return new MeshStandardMaterial({name:m.name,color:wire?'#d5d0c8':m.color,roughness:.75,metalness:0});};n.material=Array.isArray(n.material)?n.material.map(convert):convert(n.material);});
 if(!meshes||triangles>1000000)throw Error('Пустая или слишком сложная модель');
 const target=dimensions.map(Number);if(target.length!==3||target.some(n=>!Number.isFinite(n)||n<10||n>20000))throw Error('Для установки нужны ширина, высота и глубина товара');
 // OBJ exporters use either Y-up or Z-up. Compare physical aspect ratios, with rotations only.
 if (texture) {
   let mapped = false;
   model.traverse(mesh => {
     if (!mesh.isMesh || ![mesh.material].flat().some(material => texture.materials.includes(material.name))) return;
     const uv = mesh.geometry.attributes.uv;
     if (!uv) throw Error('Для материала модели отсутствуют координаты текстуры');
     for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
     mapped = true;
   });
   if (!mapped) throw Error('Для текстуры не найден материал модели');
 }
 let best=null;for(const rotation of [[0,0,0],[-Math.PI/2,0,0],[Math.PI/2,0,0],[0,Math.PI/2,0],[-Math.PI/2,0,Math.PI/2],[0,0,Math.PI/2]]){model.rotation.set(...rotation);model.updateMatrixWorld(true);const b=new Box3().setFromObject(model),s=b.getSize(new Vector3()).toArray(),ratios=s.map((v,i)=>v/target[i]);if(s.some(v=>!Number.isFinite(v)||v<=0))continue;const score=Math.log(Math.max(...ratios)/Math.min(...ratios));if(!best||score<best.score)best={rotation,score};}
 if(!best||best.score>Math.log(1.4))throw Error('Габариты модели не соответствуют карточке товара: нужна проверка варианта');
 model.rotation.set(...best.rotation);model.updateMatrixWorld(true);const bounds=new Box3().setFromObject(model),size=bounds.getSize(new Vector3()),center=bounds.getCenter(new Vector3());const unit=new Group();unit.add(model);unit.scale.set(1/size.x,1/size.y,1/size.z);unit.position.set(-center.x/size.x,-bounds.min.y/size.y,-center.z/size.z);
 let glb=Buffer.from(await new GLTFExporter().parseAsync(unit,{binary:true}));
 if (texture) glb = embedArchiveTexture(glb, await extract(texture.path), texture);
 if(glb.length>50*1024*1024)throw Error('Результат больше 50 МБ');await writeFile(output,glb);
 return {variants,format:'GLB',source:'OBJ',bytes:glb.length,meshes,triangles,durationMs:Date.now()-start,dimensionsMm:target,texture: texture?.label,warning:texture ? (options.productId==='leve-home:334625_283'?'Выбранная текстура применена к корпусу. Заводская комбинация отделок в архиве не указана.':undefined) : variants>1?'В OBJ несколько одинаковых по габаритам вариантов. Показан первый вариант геометрии; соответствие отделки карточке не подтверждено.':unassigned?'В OBJ материалы обозначены техническими цветами без привязки декоров. Модель показана в нейтральном материале.':'Перенесены базовые цвета материалов. Растровые текстуры пока не переносятся.'};
}
if(process.argv[1]?.endsWith('catalog-model-convert.mjs')&&process.argv[2])try{const report=await convertArchive(process.argv[2],process.argv[3],JSON.parse(process.argv[4]),JSON.parse(process.argv[5]||'{}'));await writeFile(process.argv[3]+'.json',JSON.stringify(report));process.stdout.write(JSON.stringify(report));}catch(e){process.stderr.write(e.message);process.exitCode=1;}
