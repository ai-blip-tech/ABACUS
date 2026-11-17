import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Group,MeshPhysicalMaterial,Box3} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {splitCabinetBody,cabinetBounds,newCabinet} from './modular-cabinets.ts';
const catalog=JSON.parse(await readFile(new URL('./public/cabinets/catalog.json',import.meta.url),'utf8'));
test('all supplied cabinet variants retain real dimensions and separate front from body',async()=>{
 for(const entry of catalog.models.filter(model=>!model.id.startsWith('base')&&model.available3D!==false)){
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

const {normalizeCabinetConfig,slabCut,slabUV,cabinetWidthMm,CABINET_BASE_HEIGHT_MM}=await import('./cabinet-layout.mjs');
const sample=catalog.samples.find(item=>item.slabWidthMm===3200);
const config=(models)=>normalizeCabinetConfig({front:sample.id,modules:models.map(newCabinet)});
test('one slab keeps its real scale, crop and direction across joined doors',()=>{
 const book=config(['5041','6541']);
 const cut=slabCut(book,catalog);
 assert.equal(cabinetWidthMm(book,catalog),1150);
 assert.deepEqual(slabCut(book,catalog),cut);
 assert.equal(cut.xMm,(3200-1150)/2);
 assert.equal(cut.yMm,(1600-390)/2);
 const middle=slabUV({x:0,y:.195},1.15,0,cut);
 assert.deepEqual(middle,[.5,.5]);
 const left=slabUV({x:.249,y:.15},.5,0,cut);
 const right=slabUV({x:-.324,y:.15},.65,500,cut);
 assert.ok(Math.abs(left[0]-right[0])<1e-12);
 assert.ok(Math.abs((left[1]-right[1])-2/3200)<1e-12);
 const shifted=slabUV({x:.149,y:.15},.5,0,cut);
 assert.ok(Math.abs(shifted[1]-left[1]-100/3200)<1e-12);
 assert.equal(CABINET_BASE_HEIGHT_MM,35);
});
test('the 260 cm composition limit permits four wide or five narrow modules',()=>{
 assert.equal(slabCut(config(['6541','6542','6541','6542']),catalog).widthMm,2600);
 assert.equal(slabCut(config(Array(5).fill('5041')),catalog).widthMm,2500);
 assert.throws(()=>slabCut(config(Array(6).fill('5041')),catalog),/260/);
 const short=catalog.samples.find(item=>item.slabWidthMm===2400);
 assert.throws(()=>slabCut({...config(Array(5).fill('5041')),front:short.id},catalog),/240/);
});
test('the assembled cabinet has one glass top and one base across every module',async()=>{
 const {Texture,TextureLoader}=await import('three');
 const {assembleCabinets}=await import('./modular-cabinets.ts');
 const originalFetch=globalThis.fetch,originalLoad=TextureLoader.prototype.loadAsync;
 const oldLocation=globalThis.location,oldProgress=globalThis.ProgressEvent;
 globalThis.location={origin:'http://cabinet.test'};
 globalThis.ProgressEvent=class{constructor(type,options){Object.assign(this,{type},options);}};
 TextureLoader.prototype.loadAsync=async()=>new Texture();
 globalThis.fetch=async request=>{
  const url=new URL(typeof request==='string'?request:request.url);
  const file=url.pathname.split('/').pop();
  const bytes=await readFile(new URL('./public/cabinets/'+file,import.meta.url));
  return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});
 };
 try{
  const assembly=await assembleCabinets(config(['5041','6542']),catalog);
  const common=[];
  assembly.traverse(mesh=>{if(mesh.userData.cabinetCommon)common.push(mesh);});
  assert.equal(common.filter(mesh=>mesh.userData.cabinetPart==='top').length,1);
  assert.equal(common.filter(mesh=>mesh.userData.cabinetPart==='legs').length,1);
  const [width,height,depth]=cabinetBounds(assembly).dimensions;
  assert.ok(Math.abs(width-1.15)<.00001);
  assert.ok(Math.abs(height-.429)<.00001);
  assert.ok(Math.abs(depth-.45)<.00001);
  const {furnitureSurfaces,updateFurnitureSurfaces}=await import('./furniture-surface-geometry.mjs');
  const surfaces=furnitureSurfaces(assembly);
  updateFurnitureSurfaces(surfaces,{},null,null);
  for(const part of surfaces)for(const group of part.mesh.geometry.groups){
   assert.ok(part.mesh.material[group.materialIndex],part.mesh.name+' has a missing face material');
  }
  const base=common.find(mesh=>mesh.userData.cabinetPart==='legs');
  assembly.updateMatrixWorld(true);
  const baseBox=new Box3().setFromObject(base);
  assert.ok(Math.abs(baseBox.max.y-baseBox.min.y-.035)<.00001);
  assert.ok(Math.abs(baseBox.max.x-baseBox.min.x-1.116)<.00001);
  const without=await assembleCabinets({...config(['5041','6542']),support:{kind:'none'}},catalog);
  assert.ok(Math.abs(cabinetBounds(without).dimensions[1]-.394)<.00001);
  without.traverse(mesh=>assert.ok(!(mesh.userData.cabinetCommon&&mesh.userData.cabinetPart==='legs')));
 }finally{
  globalThis.fetch=originalFetch;globalThis.location=oldLocation;globalThis.ProgressEvent=oldProgress;
  TextureLoader.prototype.loadAsync=originalLoad;
 }
});


test('legs use four supports through 2 m and six above 2 m, and base color is fixed',async()=>{
 const {cabinetLegPositions,CABINET_BASE_COLOR}=await import('./cabinet-layout.mjs');
 for(const width of [500,1150,2000])assert.equal(cabinetLegPositions(width,450,30,30).length,4);
 for(const width of [2001,2450,2600]){
  const feet=cabinetLegPositions(width,450,30,30);
  assert.equal(feet.length,6);
  assert.equal(feet.filter(foot=>foot[0]===0).length,2);
 }
 const normalized=normalizeCabinetConfig({...config(['5041']),base:{enabled:true,color:'#ff0000'}});
 assert.equal(normalized.base.color,CABINET_BASE_COLOR);
 const onLegs=normalizeCabinetConfig({...normalized,support:{kind:'legs',legId:'fixture-foot'}});
 assert.equal(onLegs.base.enabled,false);
});


test('factory Sideboards are grouped by actual height and incompatible modules cannot be combined',async()=>{
 const {cabinetDimensionsMm}=await import('./cabinet-layout.mjs');
 const modules=catalog.models.filter(model=>!model.id.startsWith('base'));
 assert.equal(modules.length,94);
 assert.deepEqual([...new Set(modules.map(model=>model.heightMm))].sort((a,b)=>a-b),[390,590,790,990]);
 assert.ok(modules.every(model=>model.thumbnail.endsWith('-catalog.png')));
 assert.deepEqual(modules.filter(model=>model.available3D).map(model=>model.id).sort(),['5041','5042','6541','6542']);
 assert.throws(()=>cabinetDimensionsMm({modules:[{model:'5041'},{model:'5061'}]},catalog),/высоты и глубины/);
 const alternate={...catalog,models:[{id:'first',widthMm:500,heightMm:390,depthMm:450},{id:'second',widthMm:500,heightMm:390,depthMm:400}]};
 assert.throws(()=>cabinetDimensionsMm({modules:[{model:'first'},{model:'second'}]},alternate),/высоты и глубины/);
 assert.deepEqual(cabinetDimensionsMm({modules:[{model:'5041'},{model:'6542'}]},catalog),{widthMm:1150,heightMm:390,depthMm:450});
});
