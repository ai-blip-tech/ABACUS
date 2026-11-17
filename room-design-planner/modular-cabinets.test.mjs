import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Group,MeshPhysicalMaterial,Box3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {splitCabinetBody,cabinetBounds,newCabinet} from './modular-cabinets.ts';
const catalog=JSON.parse(await readFile(new URL('./public/cabinets/catalog.json',import.meta.url),'utf8'));
test('all supplied cabinet variants retain real dimensions and separate front from body',async()=>{
 for(const entry of catalog.models.filter(model=>!model.id.startsWith('base'))){
  const bytes=await readFile(new URL('./public/cabinets/'+entry.id+'.glb',import.meta.url));
  const model=(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
  const front=new MeshPhysicalMaterial({color:'red'}),body=new MeshPhysicalMaterial({color:'white'});
  const top=new MeshPhysicalMaterial({color:'blue'});
  const split=splitCabinetBody(model,newCabinet(entry.id),entry.widthMm/1000,front,body,{top});
  const roles=new Set(split.children.map(mesh=>mesh.userData.cabinetPart));
  for(const role of ['front','body','top','left','right'])assert.ok(roles.has(role));
  for(const mesh of split.children){
   assert.equal(mesh.material,mesh.userData.cabinetPart==='front'?front:mesh.userData.cabinetPart==='top'?top:body);
   assert.ok(mesh.geometry.attributes.uv);
   if(mesh.userData.cabinetPart==='front')assert.ok(new Box3().setFromObject(mesh).min.z>=.20);
  }
  const physical=cabinetBounds(split).dimensions;
  for(const [axis,size] of [entry.widthMm,entry.heightMm,entry.depthMm].entries())assert.ok(Math.abs(physical[axis]*1000-size)<.01);
  // Parent camera fitting must never alter reported production dimensions.
  const parent=new Group();parent.scale.setScalar(.37);parent.add(split);parent.updateMatrixWorld(true);
  assert.deepEqual(cabinetBounds(split).dimensions,physical);
 }
});
