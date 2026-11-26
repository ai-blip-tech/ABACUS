import {Box3,BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshPhysicalMaterial,SRGBColorSpace,TextureLoader,Vector3} from 'three';
import sonorousCatalogue from '../lib/planning-plan/sonorous-catalog.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

import {cabinetWidthMm,cabinetDimensionsMm,normalizeCabinetConfig,isStandaloneCabinet,slabCut,slabUV,cabinetLegPositions,CABINET_BASE_HEIGHT_MM,CABINET_GLASS_THICKNESS_MM,CABINET_DOOR_GAP_MM} from './cabinet-layout.mjs';
import cabinetFrontRegions from './cabinet-front-regions.mjs';
import {cabinetFrontFinish,ceramicCabinetPriceGroup,isFixedCabinetFront} from './cabinet-front-finishes.mjs';
import {cabinetMetalFinishes,cabinetMetalFinishId} from './cabinet-metal-finishes.mjs';
export {normalizeCabinetConfig,cabinetWidthMm} from './cabinet-layout.mjs';

export const CABINET_PRODUCT='roomdesign:modular-cabinet';
export const CABINET_GEOMETRY_VERSION=2;
export type {GlassPart,CabinetModule,CabinetConfig} from '../lib/planning-plan/modular-cabinet';
import type {GlassPart,CabinetModule,CabinetConfig} from '../lib/planning-plan/modular-cabinet';
export type CabinetSample={id:string;label:string;image:string;kind:'ceramic'|'glass'|'metal';priceGroup?:number;decor?:string;color?:string;slabWidthMm?:number;slabHeightMm?:number};
export type CabinetLeg={id:string;label:string;widthMm:number;heightMm:number;depthMm:number;asset?:string;kind?:'frame'|'feet'};
type CabinetModel={id:string;widthMm:number;heightMm:number;depthMm:number;thumbnail?:string;asset?:string;available3D?:boolean;categories?:string[];fixedFront?:'transparent-glass';body?:Array<number|null>;fronts?:Array<Array<number|null>>};
export type CabinetCatalog={metalFinishes?:CabinetSample[];baseAsset?:string;legs?:CabinetLeg[];supports?:{id:string;label:string;heightMm:number;kind:'base'|'feet'|'frame'|'wall';thumbnail:string}[];models:CabinetModel[];samples:CabinetSample[]};
type SupplierManifest = {
 revision:string;
 models:Array<{id:string;kind:'module'|'support';asset:string;widthMm:number;heightMm:number;depthMm:number}>;
 textures:Array<{name:string;kind:'glass'|'ceramic';asset:string}>;
};
export const cabinetURL=(file:string)=>new URL((import.meta.env?.BASE_URL||'/')+'cabinets/'+file,location.origin).href;
export const newCabinet=(model='5041'):CabinetModule=>({id:crypto.randomUUID(),model,front:'ceramic-0',glass:'WHT',finish:'gloss',legs:true,metal:'#333333'});
const supportAssets:Record<string,string>={S13:'spike13',S20:'spike20',PLN:'plain13',TBE:'tube',CRB:'crab',CG2:'cage20',CG4:'cage_40',GPLN:'glass_plain'};


export async function cabinetCatalog():Promise<CabinetCatalog>{
 const [catalogResponse,manifestResponse]=await Promise.all([
  fetch(cabinetURL('catalog.json'),{cache:'no-store'}),
  fetch('/api/cabinet-library/current/manifest.json',{cache:'no-store'}),
 ]);
 if(!catalogResponse.ok||!manifestResponse.ok)throw Error('Не удалось загрузить каталог Sonorous.');
 const catalog:CabinetCatalog=await catalogResponse.json();
 const manifest:SupplierManifest=await manifestResponse.json();
 const assetUrl=(asset:string)=>new URL('/api/cabinet-library/'+manifest.revision+'/'+asset,location.origin).href;
 const modelsById=new Map(manifest.models.map(model=>[model.id,model]));
 const thumbnails=new Map(catalog.models.map(model=>[model.id,model.thumbnail]));
 const texturesByName=new Map(manifest.textures.map(texture=>[texture.name,texture]));
 const base=modelsById.get('base01');
 const models=Object.entries(sonorousCatalogue).map(([id,entry])=>{
  const asset=modelsById.get(id);
  return {...entry,id,thumbnail:thumbnails.get(id)||(id==='130061'?undefined:id+'-catalog.png'),fixedFront:('fixedFront' in entry?entry.fixedFront:undefined) as CabinetModel['fixedFront'],available3D:asset?.kind==='module',asset:asset&&assetUrl(asset.asset)};
 });
 const samples=catalog.samples.flatMap(sample=>{
  if(sample.kind==='glass'){
   const texture=texturesByName.get(sample.id+'.jpg');
   return [{...sample,image:texture?assetUrl(texture.asset):cabinetURL('glass/'+sample.id+'.webp'),priceGroup:1}];
  }
  const decor=sample.label.split(' · ')[1];
  const texture=decor?manifest.textures.find(item=>item.name.includes('__'+decor+'__01.')):undefined;
  if(!texture)return [];
  const code=decor?.split('-')[1]||'';
  return [{...sample,decor:code,image:assetUrl(texture.asset),priceGroup:ceramicCabinetPriceGroup(code)}];
 });
 const legs=catalog.supports?.flatMap(support=>{
  const asset=modelsById.get(supportAssets[support.id]);
  return !asset||support.kind==='base'||support.kind==='wall'?[]:[{...asset,id:support.id,label:support.label,asset:assetUrl(asset.asset),kind:support.kind}];
 });
 const metalFinishes:CabinetSample[]=cabinetMetalFinishes.map(([id,label])=>({
  id,label,image:cabinetURL('metal/'+id+'.webp'),kind:'metal',
 }));
 return {models,samples,legs,metalFinishes,supports:catalog.supports?.filter(support=>support.id!=='GPLN'),baseAsset:base&&assetUrl(base.asset)};
}
const sources=new Map<string,Promise<Group>>();
async function source(id:string,asset?:string){
 const url=asset||cabinetURL(id+'.glb');
 if(!sources.has(url))sources.set(url,new GLTFLoader().loadAsync(url).then(result=>result.scene).catch(error=>{
  sources.delete(url);
  throw error;
 }));
 return sources.get(url)!;
}
const textures=new Map<string,ReturnType<TextureLoader['loadAsync']>>();
async function surface(sample:CabinetSample|undefined,finish='matte'){
 if(!sample)throw Error('Выбранный декор отсутствует в каталоге.');
 if(!textures.has(sample.image))textures.set(sample.image,new TextureLoader().loadAsync(sample.image).then(texture=>{
  texture.colorSpace=SRGBColorSpace;
  texture.flipY=false;
  return texture;
 }).catch(error=>{textures.delete(sample.image);throw error;}));
 return new MeshPhysicalMaterial({map:await textures.get(sample.image),color:'#ffffff',roughness:finish==='gloss'?.12:.72,clearcoat:finish==='gloss'?1:0,clearcoatRoughness:.08});
}
type CabinetJoins={left:boolean;right:boolean};
const CABINET_EDGE_RIM_M=.017;
const FRONT_REGION_TOLERANCE_M=.0002;

type CabinetFrontPanel={index:number;regions:number[][];material:MeshPhysicalMaterial;cut?:ReturnType<typeof slabCut>};
const transparentFrontMaterial=()=>new MeshPhysicalMaterial({color:'#ffffff',roughness:.06,transmission:1,thickness:.006,ior:1.5,transparent:true,depthWrite:false});

export function splitCabinetBody(model:Group,module:CabinetModule,width:number,frontMaterial:MeshPhysicalMaterial,bodyMaterial:MeshPhysicalMaterial,glassMaterials:Partial<Record<GlassPart,MeshPhysicalMaterial>>={},layout?:{offsetMm:number;cut:ReturnType<typeof slabCut>;commonTop?:boolean},dimensions={height:.39,depth:.45},fixedGlass=false,panels:CabinetFrontPanel[]=[],joins:CabinetJoins={left:false,right:false}){
 const group=new Group();
 model.traverse(object=>{
  if(!(object instanceof Mesh))return;
  const geometry=object.geometry.index?object.geometry.toNonIndexed():object.geometry;
  const positions=geometry.attributes.position;
  const clearGlassSource=fixedGlass&&!Array.isArray(object.material)&&object.material.name==='Material #3';
  const roles=panels.length?[...panels.map(panel=>panel.index),'body','top','left','right']:['front','body','top','left','right'];
  const frontScale=layout&&layout.commonTop!==false&&!fixedGlass?(width-CABINET_DOOR_GAP_MM/1000)/width:1;
  for(const role of roles){
   const panel=typeof role==='number'?panels[role]:undefined;
   const points:number[]=[],uvs:number[]=[];
   for(let i=0;i<positions.count;i+=3){
    const centre=(positions.getZ(i)+positions.getZ(i+1)+positions.getZ(i+2))/3;
    // The supplied FBX front slab occupies the last 17 mm on the positive Z side.
    const a=new Vector3().fromBufferAttribute(positions,i),b=new Vector3().fromBufferAttribute(positions,i+1),c=new Vector3().fromBufferAttribute(positions,i+2);
    const normal=b.clone().sub(a).cross(c.clone().sub(a));
    const top=Math.abs(normal.y)>Math.abs(normal.x)&&Math.abs(normal.y)>Math.abs(normal.z);
    const x=(a.x+b.x+c.x)/3,y=(a.y+b.y+c.y)/3;
    const atFront=centre>dimensions.depth/2-(dimensions.depth<.4?.012:.018);
    const front=atFront&&(!fixedGlass||clearGlassSource);
    let panelIndex=-1;
    let region:number[]|undefined;
    if(front){
     for(const candidate of panels){
      region=candidate.regions.find(([left,right,bottom,upper])=>
       [a,b,c].every(point=>point.x*frontScale*1000>=left-.2&&point.x*frontScale*1000<=right+.2&&point.y*1000>=bottom-.2&&point.y*1000<=upper+.2)
      );
      if(region){panelIndex=candidate.index;break;}
     }
    }
    const internalLeft=joins.left&&x< -width/2+CABINET_EDGE_RIM_M;
    const internalRight=joins.right&&x>width/2-CABINET_EDGE_RIM_M;
    const side=Math.abs(normal.x)>Math.abs(normal.z);
    if(panelIndex<0&&(internalLeft||internalRight)&&(atFront||side)&&panels.length)continue;
    const assigned=panelIndex>=0?panelIndex:front&&!panels.length?'front':top&&y>dimensions.height-.02?'top':x< -width/2+CABINET_EDGE_RIM_M?'left':x>width/2-CABINET_EDGE_RIM_M?'right':'body';
    if(assigned!==role)continue;
    if(layout&&layout.commonTop!==false&&role==='top')continue;
    const left=region?region[0]/1000:0,right=region?region[1]/1000:0;
    const joinLeft=!!region&&joins.left&&left< -width/2+CABINET_EDGE_RIM_M;
    const joinRight=!!region&&joins.right&&right>width/2-CABINET_EDGE_RIM_M;
    for(const point of [a,b,c]){
     const position=point.clone();
     if(role==='front'||panel)position.x*=frontScale;
     if(joinLeft||joinRight){
      // Extend only the outer edge of a front at a module join. Drawer and door divisions within a module stay intact.
      const fraction=(position.x-left)/(right-left);
      const newLeft=joinLeft?-width/2:left,newRight=joinRight?width/2:right;
      position.x=fraction<FRONT_REGION_TOLERANCE_M/(right-left)?newLeft
       :fraction>1-FRONT_REGION_TOLERANCE_M/(right-left)?newRight:newLeft+fraction*(newRight-newLeft);
     }else if(panelIndex<0&&centre< -dimensions.depth/2+.002){
      if(joins.left&&position.x< -width/2+FRONT_REGION_TOLERANCE_M)position.x=-width/2;
      if(joins.right&&position.x>width/2-FRONT_REGION_TOLERANCE_M)position.x=width/2;
     }
     points.push(...position.toArray());
     const panelCut=panel?.cut||(role==='front'?layout?.cut:undefined);
     if(layout&&panelCut)uvs.push(...slabUV(position,width,layout.offsetMm,panelCut));
     else uvs.push(top?point.x/width+.5:side?point.z/dimensions.depth+.5:position.x/width+.5,top?point.z/dimensions.depth+.5:point.y/dimensions.height);
    }
   }
   if(!points.length)continue;
   const g=new BufferGeometry();
   g.setAttribute('position',new Float32BufferAttribute(points,3));
   g.setAttribute('uv',new Float32BufferAttribute(uvs,2));
   g.computeVertexNormals();
   const mesh=new Mesh(g,panel?.material||(role==='front'?frontMaterial:glassMaterials[role as GlassPart]||bodyMaterial));
   mesh.name=panel?'Фасад '+(panel.index+1):role==='front'?'Фасад':'Корпус';
   mesh.userData={cabinetModule:module.id,cabinetPart:panel?'front':role,...(panel?{cabinetFront:panel.index}:{})};
   group.add(mesh);
  }
 });
 return group;
}
export async function assembleCabinets(configuration:CabinetConfig,catalog:CabinetCatalog){
 const config=normalizeCabinetConfig(configuration) as CabinetConfig;
 const cut=slabCut(config,catalog);
 const root=new Group();
 const actualDimensions=cabinetDimensionsMm(config,catalog);
 const totalWidth=actualDimensions.widthMm/1000;
 const bodyHeight=actualDimensions.heightMm/1000;
 const depth=actualDimensions.depthMm/1000;
 const leg=config.support?.kind==='legs'?catalog.legs?.find(item=>item.id===config.support?.legId):undefined;
 if(config.support?.kind==='legs'&&!leg)throw Error('Для выбранных ножек пока не подключена 3D-модель.');
 const spike=leg?.id==='S13'?{heightMm:130,plateStartMm:74.7}:leg?.id==='S20'?{heightMm:200,plateStartMm:164.1}:undefined;
 const baseHeight=leg?(spike?.heightMm||leg.heightMm)/1000:config.base!.enabled?CABINET_BASE_HEIGHT_MM/1000:0;
 const glassFront=config.frontType==='glass';
 const standalone=isStandaloneCabinet(catalog.models.find(item=>item.id===config.modules[0].model));
 const fixedOnly=config.modules.every(module=>catalog.models.find(item=>item.id===module.model)?.fixedFront==='transparent-glass');
 const decoratedFrontMaterial=fixedOnly?null:await surface(
  catalog.samples.find(sample=>sample.id===(glassFront?config.frontGlass!.sample:config.front)),
  glassFront?config.frontGlass!.finish:'matte',
 );
 let offset=0;
 for(const [index,module] of config.modules.entries()){
  const specification=catalog.models.find(item=>item.id===module.model&&!item.id.startsWith('base'))!;
  if(specification.available3D===false)throw Error('Для модуля '+module.model+' ещё не подключена 3D-модель.');
  const width=specification.widthMm/1000;
  const [body,bodyMaterial]=await Promise.all([
   source(module.model,specification.asset),
   surface(catalog.samples.find(sample=>sample.id===module.glass),module.finish),
  ]);
  const glassMaterials=Object.fromEntries(await Promise.all(
   Object.entries({...module.surfaces,...(standalone?{top:config.top}: {})}).filter(([part])=>standalone||part!=='top').map(async([part,value])=>[
    part,await surface(catalog.samples.find(sample=>sample.id===value!.sample),value!.finish),
   ]),
  ));
  const frontMaterial=specification.fixedFront==='transparent-glass'
   ?transparentFrontMaterial()
   :decoratedFrontMaterial!;
  const regions=specification.fixedFront?[]:(cabinetFrontRegions as Record<string,number[][][]>)[module.model]||[];
  const panels=await Promise.all(regions.map(async(regions,index)=>{
   if(isFixedCabinetFront(specification,index))return {index,regions,material:['120101','120121'].includes(module.model)?transparentFrontMaterial():new MeshPhysicalMaterial({color:'#353535',roughness:.72})};
   const finish=cabinetFrontFinish(config,module,index);
   const material=module.frontFinishes?.[index]
    ?await surface(catalog.samples.find(sample=>sample.id===finish.sample),finish.type==='glass'?finish.finish:'matte')
    :frontMaterial;
   const panelCut=finish.type==='ceramic'?(module.frontFinishes?.[index]?slabCut({...config,frontType:'ceramic',front:finish.sample},catalog):cut):undefined;
   return {index,regions,material,cut:panelCut};
  }));
  const bodyGroup=splitCabinetBody(body,module,width,frontMaterial,bodyMaterial,glassMaterials,{offsetMm:offset*1000,cut,commonTop:!standalone},{height:specification.heightMm/1000,depth:specification.depthMm/1000},specification.fixedFront==='transparent-glass'&&!!specification.asset,panels,{left:index>0,right:index<config.modules.length-1});
  bodyGroup.position.set(offset+width/2,baseHeight,0);
  root.add(bodyGroup);
  offset+=width;
 }

 if(!standalone){
 // One real glass panel spans the entire composition, including module boundaries.
 const topMaterial=await surface(catalog.samples.find(sample=>sample.id===config.top!.sample),config.top!.finish);
 const thickness=CABINET_GLASS_THICKNESS_MM/1000;
 const topGeometry=new BoxGeometry(totalWidth,thickness,depth);
 // The surface editor expands material groups into an array. This panel has one glass material.
 topGeometry.clearGroups();
 const top=new Mesh(topGeometry,topMaterial);
 top.position.set(totalWidth/2,baseHeight+bodyHeight+thickness/2,0);
 top.name='Общая стеклянная столешница';
 top.userData={cabinetModule:config.modules[0].id,cabinetPart:'top',cabinetCommon:true};
 root.add(top);
 }

 if(config.base!.enabled){
  const base=await source('base01',catalog.baseAsset);
  const dimensions=cabinetBounds(base).dimensions;
  const material=new MeshPhysicalMaterial({color:config.base!.color,metalness:.85,roughness:.3});
  const common=new Group();
  base.traverse(object=>{
   if(!(object instanceof Mesh))return;
   const mesh=new Mesh(object.geometry.clone(),material);
   mesh.name='Общая база';
   mesh.userData={cabinetModule:config.modules[0].id,cabinetPart:'legs',cabinetCommon:true};
   common.add(mesh);
  });
  common.scale.set((totalWidth-.034)/dimensions[0],baseHeight/dimensions[1],1);
  common.position.x=totalWidth/2;
  root.add(common);
 }
 if(leg){
  const sourceTemplate=await source(leg.id,leg.asset);
  const template=spike?sourceTemplate.clone(true):sourceTemplate;
  if(spike){
   const {box}=cabinetBounds(template);
   const originalHeight=box.max.y-box.min.y;
   const knee=spike.plateStartMm/1000;
   const shortenedPlate=(originalHeight-knee)/2;
   const raisedKnee=baseHeight-shortenedPlate;
   template.updateMatrixWorld(true);
   const worldPoint=new Vector3();
   template.traverse(object=>{
    if(!(object instanceof Mesh))return;
    const geometry=object.geometry.clone();
    const vertices=geometry.attributes.position;
    const worldToLocal=object.matrixWorld.clone().invert();
    for(let index=0;index<vertices.count;index++){
     worldPoint.fromBufferAttribute(vertices,index).applyMatrix4(object.matrixWorld);
     const height=worldPoint.y-box.min.y;
     worldPoint.y=box.min.y+(height<=knee?height*raisedKnee/knee:raisedKnee+(height-knee)/2);
     worldPoint.applyMatrix4(worldToLocal);
     vertices.setXYZ(index,worldPoint.x,worldPoint.y,worldPoint.z);
    }
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    object.geometry=geometry;
   });
  }
  const positions=leg.kind==='frame'?[[0,0,0]]:leg.asset
   ?cabinetLegPositions(totalWidth*1000,actualDimensions.depthMm,leg.widthMm,0).filter((_,index)=>index%2===0).map(([x,y])=>[x,y,0])
   :cabinetLegPositions(totalWidth*1000,actualDimensions.depthMm,leg.widthMm,leg.depthMm);
  const finish=catalog.metalFinishes?.find(sample=>sample.id===cabinetMetalFinishId(config.support?.color));
  const material=finish?await surface(finish):new MeshPhysicalMaterial({color:'#45464a'});
  material.metalness=.58;
  material.roughness=.48;
  for(const [x,y,z] of positions){
   const foot=template.clone(true);
   foot.position.set(totalWidth/2+x,y,z);
   if(leg.id==='CRB'&&x>0)foot.scale.x=-1;
   if(leg.kind==='frame')foot.scale.x=totalWidth/(leg.widthMm/1000);
   if(leg.asset&&leg.depthMm>actualDimensions.depthMm)foot.scale.z=actualDimensions.depthMm/leg.depthMm;
   foot.traverse(object=>{
    if(!(object instanceof Mesh))return;
    object.material=material;
    object.name='Ножка';
    object.userData={cabinetModule:config.modules[0].id,cabinetPart:'legs',cabinetCommon:true};
   });
   root.add(foot);
  }
 }
 root.position.x=-totalWidth/2;
 const centered=new Group();
 centered.add(root);
 return centered;
}
export function cabinetBounds(model:Group){
 const isolated=model.clone(true);
 isolated.updateMatrixWorld(true);
 const box=new Box3().setFromObject(isolated);
 return {box,dimensions:box.getSize(new Vector3()).toArray() as [number,number,number]};
}
