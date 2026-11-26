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
  const glossy=await assembleCabinets({...config(['5041']),frontType:'glass',frontGlass:{sample:'WHT',finish:'gloss'}},catalog);
  glossy.traverse(mesh=>{if(mesh.userData.cabinetPart==='front'){
   assert.equal(mesh.material.roughness,.12);
   assert.equal(mesh.material.clearcoat,1);
  }});
  const matte=await assembleCabinets({...config(['5041']),frontType:'glass',frontGlass:{sample:'WHT',finish:'matte'}},catalog);
  matte.traverse(mesh=>{if(mesh.userData.cabinetPart==='front')assert.equal(mesh.material.roughness,.72);});
  const fixedCatalog={...catalog,models:catalog.models.map(model=>model.id==='5041'?{...model,fixedFront:'transparent-glass'}:model)};
  for(const frontType of ['ceramic','glass']){
   const fixed=await assembleCabinets({...config(['5041']),frontType,frontGlass:{sample:'BRD',finish:'matte'}},fixedCatalog);
   fixed.traverse(mesh=>{if(mesh.userData.cabinetPart==='front'){
    assert.equal(mesh.material.transmission,1);
    assert.equal(mesh.material.map,null);
    assert.equal(mesh.material.roughness,.06);
   }});
  }
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


test('39 cm sideboards are shown with TV cabinets but the factory ranges assemble separately',async()=>{
 const {cabinetInCategory,cabinetDimensionsMm}=await import('./cabinet-layout.mjs');
 const {default:sonorous}=await import('../lib/planning-plan/sonorous-catalog.mjs');
 const models=Object.entries(sonorous).map(([id,model])=>({id,...model}));
 const get=id=>models.find(model=>model.id===id);
 const arrangement=(...ids)=>({modules:ids.map(model=>({model}))});
 assert.ok(cabinetInCategory(get('5041'),'tv'));
 assert.ok(cabinetInCategory(get('5044'),'tv'));
 assert.ok(cabinetInCategory(get('5041'),'sideboards'));
 assert.ok(!cabinetInCategory(get('5061'),'tv'));
 assert.ok(cabinetInCategory(get('10041F'),'tv'));
 assert.ok(!cabinetInCategory(get('10041F'),'sideboards'));
 assert.equal(cabinetDimensionsMm(arrangement('5041','6542'),{models}).widthMm,1150);
 assert.equal(cabinetDimensionsMm(arrangement('10041F','13041F'),{models}).widthMm,2300);
 assert.throws(()=>cabinetDimensionsMm(arrangement('10041F','5041'),{models}),/отдельные композиции/);
 assert.throws(()=>cabinetDimensionsMm(arrangement('5041','10041F'),{models}),/отдельные композиции/);
});

test('support heights and fixed transparent doors match the price-list',()=>{
 const expected={BS:35,S13:130,S20:200,PLN:130,TBE:130,CRB:130,WL:0,CG2:200,CG4:400,GPLN:160};
 assert.equal(catalog.supports.length,10);
 for(const support of catalog.supports){
  assert.equal(support.heightMm,expected[support.id]);
  assert.ok(support.thumbnail.endsWith('.png'));
 }
 const transparent=catalog.models.filter(model=>model.fixedFront==='transparent-glass').map(model=>model.id).sort();
 assert.deepEqual(transparent,['5164','10162','3186','4186','5186','6183','41101','51101','61101','101101'].sort());
 const missingSize=catalog.samples.find(sample=>sample.kind==='ceramic'&&!sample.slabWidthMm);
 const glass={...config(Array(5).fill('5041')),front:missingSize.id,frontType:'glass'};
 assert.equal(slabCut(glass,catalog).widthMm,2500);
 assert.throws(()=>slabCut({...glass,modules:Array(6).fill(null).map(()=>newCabinet('5041'))},catalog),/260/);
});

test('Sonorous prices apply the module discount before the support and the retail multiplier',async()=>{
 const {default:priceList}=await import('../lib/planning-plan/sonorous-catalog.mjs');
 const {cabinetRetailPrice}=await import('./cabinet-pricing.mjs');
 const models=Object.entries(priceList).map(([id,model])=>({id,...model}));
 const samples=[{id:'WHT',kind:'glass'},{id:'PG3-example',kind:'ceramic',priceGroup:3}];
 const modules=Array.from({length:2},()=>({...newCabinet('5044'),glass:'PG3-example'}));
 const configuration={modules,front:'PG3-example',support:{kind:'legs',legId:'PLN'}};
 assert.deepEqual(cabinetRetailPrice(configuration,{models,samples}),{priceInCents:331925});
 const fixed={modules:[newCabinet('ED71DR_DL')],support:{kind:'none'}};
 assert.deepEqual(cabinetRetailPrice(fixed,{models,samples}),{priceInCents:204050});
});

test('the saved cabinet can repeat a sideboard but cannot combine bars or wall cabinets',async()=>{
 const {validateModularCabinet}=await import('../lib/planning-plan/modular-cabinet.ts');
 const make=(...ids)=>normalizeCabinetConfig({modules:ids.map(newCabinet)});
 assert.doesNotThrow(()=>validateModularCabinet(make('5044','5044')));
 assert.throws(()=>validateModularCabinet(make('5044','5063')),/одинаковой высоты и глубины/);
 assert.throws(()=>validateModularCabinet(make('ED71DR_DL','ED71DR_DL')),/по одному/);
 assert.throws(()=>validateModularCabinet(make('100121','100121')),/по одному/);
 assert.throws(()=>validateModularCabinet(make(...Array(5).fill('6544'))),/260/);
});

test('glossy bodies get an exact price and mixed body finishes get an estimate',async()=>{
 const {default:priceList}=await import('../lib/planning-plan/sonorous-catalog.mjs');
 const {cabinetRetailPrice}=await import('./cabinet-pricing.mjs');
 const models=['10082','13082'].map(id=>({id,...priceList[id]}));
 const samples=[{id:'WHT',kind:'glass'},{id:'ceramic-0',kind:'ceramic',priceGroup:3}];
 const modules=models.map(({id})=>({...newCabinet(id),finish:'gloss'}));
 const config={modules,support:{kind:'legs',legId:'PLN'}};
 assert.deepEqual(cabinetRetailPrice(config,{models,samples}),{priceInCents:712883});
 const mixed={...config,modules:[modules[0],{...modules[1],finish:'matte'}]};
 assert.deepEqual(cabinetRetailPrice(mixed,{models,samples}),{priceInCents:726990,estimated:true});
});

test('mixed cabinet fronts use their individual price rows and glaze groups',async()=>{
 const {default:priceList}=await import('../lib/planning-plan/sonorous-catalog.mjs');
 const {cabinetRetailPrice}=await import('./cabinet-pricing.mjs');
 const {ceramicCabinetPriceGroup}=await import('./cabinet-front-finishes.mjs');
 const modules=[{...newCabinet('5085'),frontFinishes:{1:{type:'glass',sample:'WHT',finish:'matte'}}}];
 const samples=[{id:'WHT',kind:'glass'},{id:'ceramic-0',kind:'ceramic',priceGroup:ceramicCabinetPriceGroup('ELA')}];
 const models=[{id:'5085',...priceList['5085']}];
 const config=normalizeCabinetConfig({modules});
 assert.deepEqual(cabinetRetailPrice(config,{models,samples}),{priceInCents:217800});
 assert.equal(ceramicCabinetPriceGroup('ANT'),2);
 assert.equal(ceramicCabinetPriceGroup('DCR'),4);
 assert.equal(ceramicCabinetPriceGroup('UNLISTED'),undefined);
 const legacy=normalizeCabinetConfig({...config,top:{sample:'ceramic-0',finish:'matte'}});
 assert.deepEqual(legacy.top,{sample:'WHT',finish:'gloss'});
});

test('cabinet specification keeps supplier articles for mixed and previously saved finishes',async()=>{
 const {default:priceList}=await import('../lib/planning-plan/sonorous-catalog.mjs');
 const {cabinetFingerprint,cabinetSpecificationFinishes,restoreCabinetSpecificationFinishes}=await import('./cabinet-specification.ts');
 const modules=[
  {...newCabinet('10082'),glass:'BLK',finish:'matte',frontFinishes:{0:{type:'glass',sample:'CSH',finish:'matte'}}},
  {...newCabinet('13082'),glass:'BLK',finish:'matte'},
 ];
 const setup=normalizeCabinetConfig({modules});
 const data={models:modules.map(({model:id})=>({id,...priceList[id]})),samples:catalog.samples};
 const first=cabinetSpecificationFinishes(setup,data)[0];
 assert.deepEqual(first.map(({surface,article})=>[surface,article]),[
  ['Корпус и столешница','BLKC'],['Фасад 1','CSHC'],['Фасады 2, 3, 4','SPA6-ELA-SHN'],
 ]);
 const saved={fingerprint:cabinetFingerprint(setup),modules:modules.map(module=>({article:module.model}))};
 const old=restoreCabinetSpecificationFinishes(saved,data);
 assert.deepEqual(old.modules[0].finishes,first);
 assert.equal(old.modules[1].finishes.find(finish=>finish.surface==='Все фасады').article,'SPA6-ELA-SHN');
 assert.equal(catalog.samples.filter(sample=>sample.kind==='glass').length,15);
});
