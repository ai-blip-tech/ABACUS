import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {FBXLoader} from 'three/addons/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Box3,Vector3,Group,MeshStandardMaterial} from 'three';
if(!process.argv[2])throw Error('Укажите путь к папке с FBX-моделями и декорами.');
const source=resolve(process.argv[2]);
const out=resolve('room-design-planner/public/cabinets');
await mkdir(out,{recursive:true});
globalThis.window={URL:{createObjectURL:()=>''}};
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(result=>{this.result=result;this.onloadend?.();});}};
let models=[];
for(const name of ['5041','5042','6541','6542','base01','base02']){
 const b=await readFile(join(source,name+'.fbx'));
 const root=new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
 root.updateMatrixWorld(true);
 const box=new Box3().setFromObject(root),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  mesh.geometry.applyMatrix4(mesh.matrixWorld);
  mesh.geometry.translate(-center.x,-box.min.y,-center.z);
  mesh.geometry.scale(.001,.001,.001);
  mesh.position.set(0,0,0);mesh.rotation.set(0,0,0);mesh.scale.set(1,1,1);
  mesh.material=new MeshStandardMaterial({color:'#f4f1ec',roughness:.45});
 });
 const group=new Group();
 for(const child of [...root.children])group.add(child);
 const data=await new GLTFExporter().parseAsync(group,{binary:true});
 await writeFile(join(out,name+'.glb'),Buffer.from(data));
 models.push({id:name,widthMm:Math.round(size.x),heightMm:Math.round(size.y),depthMm:Math.round(size.z)});
}
const samples=[];
for(const [id,label,color] of [['BLK','Чёрный','#222222'],['WHT','Белый','#eeeeea'],['GRY','Серый','#858581'],['CGR','Светло-серый','#b2b2ac'],['GRP','Графит','#45464a'],['BRD','Бордовый','#6b484d']]){
 await copyFile(join(source,id+'.jpg'),join(out,id+'.jpg'));
 samples.push({id,label,color,image:'./cabinets/'+id+'.jpg',kind:'glass'});
}
const dir=join(source,'CERAMIC_DECORS_CATALOG_NAMES_2026-11-16','DECORS');
async function decors(folder){
 for(const entry of await readdir(folder,{withFileTypes:true})){
  if(entry.isDirectory())await decors(join(folder,entry.name));
  else if(/__01\.jpg$/i.test(entry.name)){
   const id='ceramic-'+samples.filter(s=>s.kind==='ceramic').length;
   await copyFile(join(folder,entry.name),join(out,id+'.jpg'));
   samples.push({id,label:entry.name.replace(/__01\.jpg$/i,'').replace('__',' · '),image:'./cabinets/'+id+'.jpg',kind:'ceramic'});
  }
 }
}
await decors(dir);
const slabSizes=JSON.parse(await readFile(new URL('./cabinet-slab-sizes.json',import.meta.url),'utf8'));
for(const sample of samples){
 if(sample.kind==='ceramic')Object.assign(sample,slabSizes[sample.label.split(' · ').at(-1)]||{});
}
const factory=JSON.parse(await readFile(join(out,'sideboards-catalog.json'),'utf8'));
const preparedIds=new Set(models.map(item=>item.id));
models=[...factory.map(item=>({...item,available3D:preparedIds.has(item.id)})),...models.filter(item=>item.id.startsWith('base'))];
models.sort((a,b)=>a.heightMm-b.heightMm||a.widthMm-b.widthMm||a.id.localeCompare(b.id));
await writeFile(join(out,'catalog.json'),JSON.stringify({models,samples},null,2));
console.log(JSON.stringify({models,textures:samples.length}));
