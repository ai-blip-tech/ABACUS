import {plannerFurnitureNode} from '../lib/planning-plan/planner-adapter';
import type {FurnitureViewPose} from '../lib/planning-plan/furniture-view-placement';
import type {FurnitureItem} from '../lib/planning-plan/furniture';
import type {MeasureDoc} from '../lib/measured-plan/measure-model';
import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Canvas, type ThreeEvent} from '@react-three/fiber';
import {Environment,Lightformer,OrbitControls} from '@react-three/drei';
import {loadAssetUrl, saveAsset, useScene, emitter, nodeRegistry, runAsSingleSceneHistoryStep} from '@pascal-app/core';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Box3, Color, Group, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3} from 'three';
import {CABINET_PRODUCT,CABINET_GEOMETRY_VERSION,cabinetCatalog,assembleCabinets,newCabinet,cabinetBounds,cabinetURL,normalizeCabinetConfig,cabinetWidthMm,type CabinetConfig,type CabinetCatalog,type GlassPart} from './modular-cabinets';
import type {CabinetFrontFinish} from '../lib/planning-plan/modular-cabinet';
import {MAX_CABINET_WIDTH_MM,cabinetCategoryLabels,cabinetInCategory,isStandaloneCabinet,slabCut} from './cabinet-layout.mjs';
import {cabinetFrontFinish,glassCabinetArticle,isFixedCabinetFront} from './cabinet-front-finishes.mjs';
import {cabinetMetalFinishId} from './cabinet-metal-finishes.mjs';
import {cabinetRetailPrice,cabinetSupportPrice} from './cabinet-pricing.mjs';
import {CabinetDimensions} from './cabinet-dimensions';
import {CabinetPhoto} from './cabinet-photo';
import {cabinetFingerprint,cabinetSpecificationFinishes,loadCabinetSpecification,restoreCabinetSpecificationFinishes,saveCabinetSpecification,type CabinetSpecification} from './cabinet-specification';
import {CabinetSelect} from './cabinet-select';
import {furnitureSurfaces,updateFurnitureSurfaces} from './furniture-surface-geometry.mjs';
import './cabinet-configurator.css';

export const TETRA_PRODUCT = 'leve-home:334625_819';
const cabinetPanels = [['modules','Модули'],['finish','Отделка'],['support','Опора']] as const;
type CabinetPanel = typeof cabinetPanels[number][0];
type Sample = {id:string;label:string;image:string;kind?:string;decor?:string;priceGroup?:number;slabWidthMm?:number;slabHeightMm?:number};
const retailCurrency=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'EUR'});
const cabinetTitles:Record<string,string>={wall:'Настенный шкаф','transparent-wall':'Прозрачный настенный шкаф',bars:'Бар',drawers:'Комод',tv:'ТВ-тумба'};
type Draft = Record<string,string>;
type CatalogRequest = (productId:string, options:{surfaceEditing:true})=>Promise<{textures:Sample[]}>;
const catalogId = (node:any) => node?.metadata?.catalogProductId || node?.metadata?.roomDesignFurniture?.catalog?.id;

type CabinetCreation={kind:'dresser'|'tv_stand';pose:FurnitureViewPose};
type FurniturePlacement=(item:FurnitureItem,pose:FurnitureViewPose)=>{item:FurnitureItem;plan:MeasureDoc};

export function FurnitureSurfaceMenu({requestCatalog,onOpenChange,resolvePlacement,specificationScope}:{requestCatalog:CatalogRequest;onOpenChange:(active:boolean)=>void;resolvePlacement:FurniturePlacement;specificationScope:string}) {
 const [menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null);
 const [target,setTarget]=useState<string|null>(null);
 const [creation,setCreation]=useState<CabinetCreation|null>(null);
 useEffect(()=>{onOpenChange(!!target||!!creation);return()=>onOpenChange(false);},[target,creation,onOpenChange]);
 useEffect(()=>{
  let point={x:20,y:60};
  const remember=(event:MouseEvent)=>{point={x:event.clientX,y:event.clientY};};
  const open=(id:string)=>{const node=useScene.getState().nodes[id as any];setMenu([TETRA_PRODUCT,CABINET_PRODUCT].includes(catalogId(node))?{id,...point}:null);};
  const native=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.type==='menu')open(detail.id);};
  const scene=(event:any)=>{if(![TETRA_PRODUCT,CABINET_PRODUCT].includes(catalogId(event.node)))return;event.stopPropagation?.();open(event.node.id);};
  const close=(event:PointerEvent)=>{if(event.button===0&&event.target instanceof HTMLCanvasElement)setMenu(null);};
  const configure=(event:Event)=>setTarget((event as CustomEvent).detail.id);
  const create=(event:Event)=>{const detail=(event as CustomEvent<CabinetCreation>).detail;if((detail.kind==='dresser'||detail.kind==='tv_stand')&&detail.pose){setTarget(null);setMenu(null);setCreation(detail);}};
  window.addEventListener('roomdesign:configure-cabinet-create',create);
  window.addEventListener('roomdesign:configure-cabinet',configure);
  window.addEventListener('contextmenu',remember,true);
  window.addEventListener('roomdesign:item-interaction',native);
  window.addEventListener('pointerdown',close,true);
  emitter.on('node:context-menu',scene);
  return()=>{window.removeEventListener('roomdesign:configure-cabinet-create',create);window.removeEventListener('roomdesign:configure-cabinet',configure);window.removeEventListener('contextmenu',remember,true);window.removeEventListener('roomdesign:item-interaction',native);window.removeEventListener('pointerdown',close,true);emitter.off('node:context-menu',scene);};
 },[]);
 return <>
  {menu&&<div className="rd-furniture-surface-menu" style={{left:Math.min(menu.x,innerWidth-184),top:Math.min(menu.y,innerHeight-56)}}>
   <button type="button" onClick={()=>{setTarget(menu.id);setMenu(null);}}>Добавить текстуру</button>
  </div>}
  {creation&&<FurnitureSurfaceEditor id="new-cabinet" creation={creation} specificationScope={specificationScope} resolvePlacement={resolvePlacement} requestCatalog={requestCatalog} onClose={()=>setCreation(null)}/>}
  {target&&<FurnitureSurfaceEditor key={target} id={target} specificationScope={specificationScope} resolvePlacement={resolvePlacement} requestCatalog={requestCatalog} onClose={()=>setTarget(null)}/>}
 </>;
}

function FurnitureSurfaceEditor({id,creation,resolvePlacement,requestCatalog,onClose,specificationScope}:{id:string;creation?:CabinetCreation;resolvePlacement:FurniturePlacement;requestCatalog:CatalogRequest;onClose:()=>void;specificationScope:string}) {
 const createKind=creation?.kind;
 const dialog=useRef<HTMLDialogElement>(null);
 const node=(createKind?{name:createKind==='tv_stand'?'Индивидуальная ТВ-тумба':'Индивидуальный комод',metadata:{catalogProductId:CABINET_PRODUCT}}:useScene.getState().nodes[id as any]) as any;
 const cabinet=catalogId(node)===CABINET_PRODUCT;
 const [cabinetData,setCabinetData]=useState<CabinetCatalog|null>(null);
 const [configuration,setConfiguration]=useState<CabinetConfig>(()=>normalizeCabinetConfig(node?.metadata?.modularCabinet||{modules:[newCabinet()]}));
 const [activeModule,setActiveModule]=useState<string|undefined>(configuration.modules[0]?.id);
 const [cabinetPanel,setCabinetPanel]=useState<CabinetPanel>('modules');
 const cabinetPanelContent=useRef<HTMLDivElement>(null);
 const emptyCabinet=cabinet&&!configuration.modules.length;
 const [partialFront,setPartialFront]=useState(false);
 const [frontIndex,setFrontIndex]=useState<number|null>(null);
 const [cabinetPart,setCabinetPart]=useState<'front'|'body'|'top'|'left'|'right'|'legs'>('front');
 const [allModules,setAllModules]=useState(false);
 const [assembling,setAssembling]=useState(cabinet);
 const [catalogHeight,setCatalogHeight]=useState(390),[catalogWidth,setCatalogWidth]=useState('all'),[catalogDepth,setCatalogDepth]=useState(450);
 const [showDimensions,setShowDimensions]=useState(false);
 const dimensionControls=useRef<any>(null);
 const [category,setCategory]=useState('sideboards');
 const [moduleAction,setModuleAction]=useState<'add'|'replace'>('add');
 const [samples,setSamples]=useState<Sample[]>([]);
 const [model,setModel]=useState<Group|null>(null);
 const [parts,setParts]=useState<ReturnType<typeof furnitureSurfaces>>([]);
 const [draft,setDraft]=useState<Draft>(node?.metadata?.surfaceTextureDraft||{});
 const [selected,setSelected]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [pending,setPending]=useState(false);
 const [specification,setSpecification]=useState<CabinetSpecification[]|null>(null);
 const [savingSpecification,setSavingSpecification]=useState(false);
 const [photoReady,setPhotoReady]=useState(false);
 const [preparingSpecification,setPreparingSpecification]=useState(false);
 const capturePhoto=useRef<((dimensions:[number,number,number])=>Promise<CabinetSpecification['photos']>)|null>(null);
 const materials=useRef(new Map<string,MeshStandardMaterial>());
 const highlight=useRef(new MeshStandardMaterial({color:'#ede1dc',emissive:'#82364b',emissiveIntensity:.3}));

 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 useEffect(()=>{cabinetPanelContent.current?.scrollTo(0,0);},[cabinetPanel]);
 useEffect(()=>{
  if(!cabinet)return;
  let active=true;
  loadCabinetSpecification(specificationScope).then(items=>{if(active)setSpecification(items);}).catch(()=>{
   if(active)setError('Не удалось открыть избранное и спецификацию.');
  });
  return()=>{active=false;};
 },[cabinet,specificationScope]);
 useEffect(()=>{
  let active=true;
  async function load() {
   if(cabinet){const data=await cabinetCatalog();if(active){setCabinetData(data);setSamples(data.samples);const first=data.models.find(item=>item.id===configuration.modules[0]?.model);if(first){setCatalogHeight(first.heightMm);setCatalogDepth(first.depthMm);setCategory(cabinetInCategory(first,'sideboards')?'sideboards':first.categories?.[0]||'sideboards');if(isStandaloneCabinet(first))setModuleAction('replace');}}return;}
   if(!node?.metadata?.roomDesignModelAsset)throw Error('Сначала дождитесь загрузки 3D-модели TETRA.');
   const baseRef=node.metadata.surfaceTextureBase||node.metadata.roomDesignModelAsset;
   const [url,result]=await Promise.all([loadAssetUrl(baseRef),requestCatalog(TETRA_PRODUCT,{surfaceEditing:true})]);
   if(!url)throw Error('Исходная модель недоступна. Откройте лист заново.');
   if(!result.textures.length)throw Error('В архиве нет доступных образцов.');
   const loaded=(await new GLTFLoader().loadAsync(url)).scene;
   const bounds=new Box3().setFromObject(loaded),size=bounds.getSize(new Vector3());
   if(size.toArray().some(axis=>!Number.isFinite(axis)||axis<.0001))throw Error('Некорректная геометрия модели');
   const surfaces=furnitureSurfaces(loaded);
   if(!active)return;
   setParts(surfaces);
   setSamples(result.textures);
   setModel(loaded);
  }
  void load().catch(reason=>{if(active)setError(reason.message);});
  return()=>{active=false;};
 },[]);

 useEffect(()=>{
  if(!cabinet||!cabinetData)return;
  if(emptyCabinet){
   setModel(null);
   setParts([]);
   setSelected(null);
   setAssembling(false);
   return;
  }
  let active=true;
  setAssembling(true);
  setError('');
  assembleCabinets(configuration,cabinetData).then(assembled=>{
   if(!active)return;
   setParts(furnitureSurfaces(assembled));
   setModel(assembled);
   setSelected(null);
   setAssembling(false);
  }).catch(reason=>{if(active){setError(reason.message);setAssembling(false);setModel(null);setParts([]);}});
  return()=>{active=false;};
 },[cabinet,cabinetData,configuration,emptyCabinet]);

 function setCabinetConfiguration(next:CabinetConfig){
  try{
   if(cabinetData&&next.modules.length){
    slabCut(next,cabinetData);
    const missing=next.modules.find(module=>cabinetData.models.find(item=>item.id===module.model)?.available3D===false);
    if(missing)throw Error('Для модуля '+missing.model+' ещё не подключена 3D-модель.');
   }
   setConfiguration(next);
   setError('');
   return true;
  }catch(reason){setError((reason as Error).message);return false;}
 }
 function chooseFrontFinish(finish:CabinetFrontFinish){
  if(fixedTransparentFront||waitingForFront)return;
  if(partialFront&&frontIndex!==null&&activeCabinet){
   if(finish.type==='ceramic'&&cabinetData){
    try{slabCut({...configuration,frontType:'ceramic',front:finish.sample},cabinetData);}
    catch(reason){setError((reason as Error).message);return;}
   }
   if(setCabinetConfiguration({...configuration,modules:configuration.modules.map(module=>module.id===activeModule
    ?{...module,frontFinishes:{...module.frontFinishes,[frontIndex]:finish}}:module)}))setSelected(null);
  }else{
   const modules=configuration.modules.map(module=>({...module,frontFinishes:undefined}));
   setCabinetConfiguration({...configuration,modules,frontType:finish.type,
    ...(finish.type==='glass'?{frontGlass:{sample:finish.sample,finish:finish.finish||'gloss'}}:{front:finish.sample})});
  }
 }
 function chooseFrontType(type:'ceramic'|'glass'){
  if(type===currentFront?.type)return;
  if(type==='glass'){
   chooseFrontFinish({type,sample:configuration.frontGlass?.sample||'WHT',finish:configuration.frontGlass?.finish||'gloss'});
   return;
  }
  const width=cabinetData?cabinetWidthMm(configuration,cabinetData):0;
  const height=firstModel?.heightMm||0;
  const suitable=cabinetData?.samples.filter(sample=>sample.kind==='ceramic'&&(sample.slabWidthMm||0)>=width&&(sample.slabHeightMm||0)>=height)||[];
  const sample=suitable.find(item=>item.id===configuration.front)||suitable[0];
  if(sample)chooseFrontFinish({type,sample:sample.id});
  else setError('Для этих размеров нет подтверждённого слэба.');
 }
 function changeGlass(patch:{sample?:string;finish?:'gloss'|'matte'}){
  if(cabinetPart==='body'){
   setCabinetConfiguration({...configuration,top:{...configuration.top!,...patch},modules:configuration.modules.map(module=>({
    ...module,glass:patch.sample||module.glass,finish:patch.finish||module.finish,
    surfaces:Object.fromEntries(Object.entries(module.surfaces||{}).map(([side,glass])=>[side,{...glass,...patch}])),
   }))});
   return;
  }
  if(cabinetPart==='top'){
   setCabinetConfiguration({...configuration,top:{...configuration.top!,...patch}});
   return;
  }
  setCabinetConfiguration({...configuration,modules:configuration.modules.map(module=>{
   if(module.id!==activeModule&&!allModules)return module;
   const part=cabinetPart as GlassPart,previous=module.surfaces?.[part]||{sample:module.glass,finish:module.finish};
   return {...module,surfaces:{...module.surfaces,[part]:{...previous,...patch}}};
  })});
 }
 const activeCabinet=configuration.modules.find(module=>module.id===activeModule);
 const activeModel=cabinetData?.models.find(item=>item.id===activeCabinet?.model);
 const firstModel=cabinetData?.models.find(item=>item.id===configuration.modules[0]?.model);
 const waitingForFront=partialFront&&frontIndex===null;
 const fixedTransparentFront=partialFront
  ?activeModel&&frontIndex!==null&&isFixedCabinetFront(activeModel,frontIndex)
  :!!cabinetData&&configuration.modules.every(module=>cabinetData.models.find(item=>item.id===module.model)?.fixedFront==='transparent-glass');
 const currentFront=activeCabinet?cabinetFrontFinish(configuration,activeCabinet,partialFront?(frontIndex??-1):-1):undefined;
 const canReplaceFront=parts.some(({mesh})=>{
  const {cabinetModule,cabinetFront}=mesh.userData;
  if(typeof cabinetFront!=='number')return false;
  const module=configuration.modules.find(item=>item.id===cabinetModule);
  const specification=cabinetData?.models.find(item=>item.id===module?.model);
  return !!specification&&!isFixedCabinetFront(specification,cabinetFront);
 });
 function togglePartialFront(){
  setPartialFront(value=>!value);
  setFrontIndex(null);
  setSelected(null);
  setError('');
 }
 const transparentWall=firstModel?.categories?.includes('transparent-wall');
 const standalone=isStandaloneCabinet(firstModel);
 const bar=firstModel?.categories?.includes('bars');
 const supportsAvailable=!standalone||bar;
 const browsingStandalone=['wall','transparent-wall','bars'].includes(category);
 function openCabinetPanel(panel:CabinetPanel){
  setCabinetPanel(panel);
  if(panel==='finish'){
   if(cabinetPart==='legs')setCabinetPart('front');
   return;
  }
  setPartialFront(false);
  setFrontIndex(null);
  setSelected(null);
  setAllModules(false);
  if(panel==='support')setCabinetPart('legs');
 }
 function chooseModule(model:string){
  const specification=cabinetData?.models.find(item=>item.id===model);
  const individual=isStandaloneCabinet(specification);
  const replace=!emptyCabinet&&(moduleAction==='replace'||standalone||browsingStandalone);
  const module=newCabinet(model);
  const replacingWithDefault=individual||standalone||emptyCabinet;
  const draftModules=replace?configuration.modules.map(current=>
   current.id===activeModule?(replacingWithDefault?module:{...current,model,frontFinishes:undefined}):current
  ):[...configuration.modules,activeCabinet?{...module,glass:activeCabinet.glass,finish:activeCabinet.finish}:module];
  const next=normalizeCabinetConfig({
   ...(replacingWithDefault?{frontType:individual?'glass':'ceramic',support:{kind:individual?'none':'base'}}:configuration),
   modules:draftModules,
  }) as CabinetConfig;
  if(setCabinetConfiguration(next)){
   setActiveModule(replace&&!replacingWithDefault?activeModule:module.id);
   setFrontIndex(null);
   setPartialFront(false);
   setAllModules(false);
   if(individual)setModuleAction('replace');
  }
 }
 function removeActiveModule(){
  if(pending||!activeCabinet)return;
  const modules=configuration.modules.filter(module=>module.id!==activeModule);
  if(setCabinetConfiguration({...configuration,modules})){
   setActiveModule(modules[0]?.id);
   setFrontIndex(null);
   setPartialFront(false);
   setModuleAction('add');
   setAllModules(false);
   if(!modules.length)setCabinetPanel('modules');
   dialog.current?.focus();
  }
 }
 function browseCategory(next:string){
  const candidates=cabinetData?.models.filter(item=>cabinetInCategory(item,next))||[];
  const first=candidates.find(item=>item.available3D)||candidates[0];
  openCabinetPanel('modules');
  setCategory(next);
  setCatalogWidth('all');
  if(first){setCatalogHeight(first.heightMm);setCatalogDepth(first.depthMm);}
  if(['wall','transparent-wall','bars'].includes(next)||standalone)setModuleAction('replace');
 }
 function materialFor(sampleId:string) {
  const cached=materials.current.get(sampleId);
  if(cached)return cached;
  const sample=samples.find(item=>item.id===sampleId);
  if(!sample)return undefined;
  const texture=new TextureLoader().load(sample.image);
  texture.colorSpace=SRGBColorSpace;
  texture.flipY=false;
  texture.wrapS=texture.wrapT=RepeatWrapping;
  const material=new MeshStandardMaterial({color:new Color('white'),map:texture,roughness:.8});
  materials.current.set(sampleId,material);
  return material;
 }
 const surfaces=useMemo(()=>[...new Set(parts.flatMap(part=>part.faceIds))], [parts]);
 const wholeModel=selected==='all';
 const selection=wholeModel?surfaces:selected?[selected]:[];
 const selectedSample=selection.length&&selection.every(surface=>draft[surface]===draft[selection[0]])?draft[selection[0]]:undefined;

 function applySample(sampleId:string) {
  if(cabinet){
   if(pending||assembling||cabinetPart==='front'&&(fixedTransparentFront||waitingForFront))return;
   if(cabinetPart==='front'){
    chooseFrontFinish({type:frontIsGlass?'glass':'ceramic',sample:sampleId,finish:frontIsGlass?currentFront?.finish||'gloss':undefined});
   }else changeGlass({sample:sampleId});
   return;
  }
  if (!selection.length || pending) return;
  setDraft(current=>({...current,...Object.fromEntries(selection.map(surface=>[surface,sampleId]))}));
 }

 function resetSelection() {
  setDraft(current=>{
   const next={...current};
   for (const surface of selection) delete next[surface];
   return next;
  });
 }

 const draftMaterials=()=>Object.fromEntries(Object.entries(draft).flatMap(([surface,sample])=>{
  const material=materialFor(sample);
  return material?[[surface,material]]:[];
 }));
 useEffect(()=>{
  if(!model)return;
  const selectedSurface=selected&&draft[selected]?null:selected;
  if(cabinet&&partialFront&&frontIndex!==null&&selectedSurface){
   for(const part of parts){
    const {cabinetModule,cabinetFront}=part.mesh.userData;
    updateFurnitureSurfaces([part],{},cabinetModule===activeModule&&cabinetFront===frontIndex?'all':null,highlight.current);
   }
   return;
  }
  updateFurnitureSurfaces(parts,cabinet?{}:draftMaterials(),selectedSurface,highlight.current);
 },[model,parts,draft,selected,cabinet,partialFront,frontIndex,activeModule]);

 function pick(event:ThreeEvent<MouseEvent>) {
  if(event.delta>4||event.faceIndex==null)return;
  const part=parts.find(part=>part.mesh===event.object);
  if(!part)return;
  event.stopPropagation();
  const face=part.faceIds[event.faceIndex];
  const {cabinetModule,cabinetPart:surface,cabinetFront}=event.object.userData;
  if(!cabinet||!cabinetModule){setSelected(face);return;}
  if(partialFront){
   if(surface!=='front'||typeof cabinetFront!=='number')return;
   const module=configuration.modules.find(item=>item.id===cabinetModule);
   const specification=cabinetData?.models.find(item=>item.id===module?.model);
   if(!specification)return;
   if(isFixedCabinetFront(specification,cabinetFront)){
    setFrontIndex(null);
    setSelected(null);
    setError('У этого фасада заводская отделка. Выберите другой фасад.');
    return;
   }
   setFrontIndex(cabinetFront);
   setSelected(face);
  }else{
   if(surface==='legs'&&!supportsAvailable)return;
   setCabinetPanel(surface==='legs'?'support':'finish');
   setCabinetPart(surface);
   setSelected(surface==='front'?null:face);
  }
  setError('');
  setActiveModule(cabinetModule);
  setAllModules(false);
 }

 async function confirm() {
  if(pending)return;
  if(emptyCabinet&&!creation){
   runAsSingleSceneHistoryStep(useScene,()=>useScene.getState().deleteNodes([id as any]));
   onClose();
   return;
  }
  if(!model)return;
  if(!cabinet&&JSON.stringify(draft)===JSON.stringify(node.metadata.surfaceTextureDraft||{})){onClose();return;}
  setPending(true);setError('');
  try {
   const assignments=cabinet?{}:draftMaterials();
   await Promise.all([...new Set(Object.values(assignments))].map(async material=>{
    if(material.map?.image?.decode)await material.map.image.decode();
    else if(material.map&&!material.map.image){
     // TextureLoader may still be decoding; use the source image from the sample below.
     const sample=samples.find(item=>materials.current.get(item.id)===material);
     if(sample){const image=new Image();image.src=sample.image;await image.decode();material.map.image=image;material.map.needsUpdate=true;}
    }
   }));
   updateFurnitureSurfaces(parts,assignments,null,null);
   let exported=model;
   let dimensions:[number,number,number]|undefined;
   if(cabinet){
    dimensions=cabinetBounds(model).dimensions;
    exported=new Group();
    exported.add(model.clone(true));
    exported.scale.set(1/dimensions[0],1/dimensions[1],1/dimensions[2]);
   }
   let newCabinetNode:ReturnType<typeof plannerFurnitureNode>|undefined;
   if(creation){
    if(!dimensions)throw Error('Не удалось определить габариты комода');
    const kind=creation.kind,name=cabinetTitles[firstModel?.categories?.[0]||'']||(kind==='tv_stand'?'Индивидуальная ТВ-тумба':'Индивидуальный комод');
    const furniture:FurnitureItem={id:crypto.randomUUID(),kind,name,position:[0,0],
     width:dimensions[0]*1000,height:dimensions[1]*1000,depth:dimensions[2]*1000,rotation:0,
     dimensionsSource:'user',catalogType:kind,catalog:{id:CABINET_PRODUCT,name,url:'',source:'room-design'}};
    const placement=resolvePlacement(furniture,creation.pose);
    newCabinetNode=plannerFurnitureNode(placement.plan,placement.item,dimensions,'');
   }
   const buffer=await new GLTFExporter().parseAsync(exported,{binary:true});
   if(!(buffer instanceof ArrayBuffer))throw Error('Не удалось подготовить модель с текстурами');
   const assetRef=await saveAsset(new File([buffer],cabinet?'modular-cabinet.glb':'tetra-surface-textures.glb',{type:'model/gltf-binary'}));
   const src=await loadAssetUrl(assetRef);
   const store=useScene.getState();
   const current=store.nodes[id as any] as any;
   if(!src)throw Error('Не удалось применить текстуры к предмету');
   if(newCabinetNode){
    const schema=nodeRegistry.get('item')?.schema;
    if(!schema)throw Error('Редактор мебели ещё загружается.');
    newCabinetNode.asset={...newCabinetNode.asset,id:newCabinetNode.id,src};
    Object.assign(newCabinetNode.metadata,{catalogProductId:CABINET_PRODUCT,modularCabinet:configuration,cabinetGeometryVersion:CABINET_GEOMETRY_VERSION,
     roomDesignModelAsset:assetRef,representation:'catalog-converted'});
    store.createNode(schema.parse(newCabinetNode) as any,newCabinetNode.parentId as any);
    onClose();return;
   }
   if(!current)throw Error('Не удалось применить текстуры к предмету');
   useScene.getState().updateNode(id as any,{
    ...(cabinet&&cabinetTitles[firstModel?.categories?.[0]||'']?{name:cabinetTitles[firstModel!.categories![0]]}:{}),
    asset:{...current.asset,src,...(cabinet?{dimensions:[1,1,1]}:{}),id:`catalog-surface-${id}-${crypto.randomUUID()}`},
    ...(dimensions?{scale:dimensions}:{}),
    metadata:{...current.metadata,...(cabinet?{modularCabinet:configuration,cabinetGeometryVersion:CABINET_GEOMETRY_VERSION}:{}),roomDesignModelAsset:assetRef,surfaceTextureBase:node.metadata.surfaceTextureBase||node.metadata.roomDesignModelAsset,surfaceTextureDraft:draft},
   } as any);
   onClose();
  } catch(reason) {
   setError((reason as Error).message);
   setPending(false);
  }
 }

 const aspect=cabinet&&model?cabinetBounds(model).dimensions:node?.scale||[1.4,.55,.4];
 const bodyGlass=[configuration.top,...configuration.modules.flatMap(module=>{
  const base={sample:module.glass,finish:module.finish};
  return [module.surfaces?.left||base,module.surfaces?.right||base];
 })];
 const selectedGlass=cabinetPart==='body'?{
  sample:bodyGlass.every(glass=>glass?.sample===configuration.top?.sample)?configuration.top?.sample:undefined,
  finish:bodyGlass.every(glass=>glass?.finish===configuration.top?.finish)?configuration.top?.finish:undefined,
 }:cabinetPart==='top'?configuration.top!:activeCabinet?.surfaces?.[cabinetPart as GlassPart]||{sample:activeCabinet?.glass,finish:activeCabinet?.finish};
 const glassSelected=['body','top','left','right'].includes(cabinetPart);
 const frontIsGlass=currentFront?.type==='glass';
 const frontGlassSelected=cabinetPart==='front'&&frontIsGlass;
 const visibleSamples=emptyCabinet?[]:cabinet?samples.filter(sample=>{
  if(cabinetPart==='front')return !fixedTransparentFront&&!waitingForFront&&sample.kind===(frontIsGlass?'glass':'ceramic');
  return sample.kind==='glass';
 }):samples;
 const catalogueModels=cabinetData?.models.filter(item=>cabinetInCategory(item,category))||[];
 const heights=[...new Set(catalogueModels.map(item=>item.heightMm))].sort((a,b)=>a-b);
 const depths=[...new Set(catalogueModels.filter(item=>item.heightMm===catalogHeight).map(item=>item.depthMm))].sort((a,b)=>a-b);
 const widths=[...new Set(catalogueModels.filter(item=>item.heightMm===catalogHeight&&item.depthMm===catalogDepth).map(item=>item.widthMm))].sort((a,b)=>a-b);
 const shownModels=catalogueModels.filter(item=>item.heightMm===catalogHeight&&item.depthMm===catalogDepth&&(catalogWidth==='all'||item.widthMm===Number(catalogWidth))).sort((a,b)=>Number(a.available3D===false)-Number(b.available3D===false)||a.widthMm-b.widthMm||a.id.localeCompare(b.id,undefined,{numeric:true}));
 const width=cabinetData&&!emptyCabinet?cabinetWidthMm(configuration,cabinetData):0;
 const ceramicFrontChosen=cabinet&&cabinetPart==='front'&&!frontIsGlass&&!fixedTransparentFront&&!waitingForFront&&!emptyCabinet;
 const ceramicGroups=[2,3,4].map(group=>({group,samples:visibleSamples.filter(sample=>sample.priceGroup===group)}));
 const price=cabinetData&&!emptyCabinet&&cabinetRetailPrice(configuration,cabinetData);
 const replacing=!emptyCabinet&&(moduleAction==='replace'||standalone||browsingStandalone);
 const metalFinish=cabinetMetalFinishId(configuration.support?.color);
 const moduleCount=configuration.modules.length;
 const moduleLabel=moduleCount===1?'модуль':moduleCount>=2&&moduleCount<=4?'модуля':'модулей';
 const supportKind=configuration.support?.kind;
 const supportId=supportKind==='legs'?configuration.support?.legId:supportKind==='base'?'BS':supportKind;
 const supportLabel=cabinetData?.supports?.find(support=>support.id===supportId)?.label;
 const fingerprint=cabinet&&!emptyCabinet?cabinetFingerprint(configuration):'';
 const isFavorite=!!specification?.some(item=>item.fingerprint===fingerprint);
 const cabinetStatus=pending?'Сохраняем композицию…':savingSpecification?'Добавляем в спецификацию…':preparingSpecification?'Готовим PowerPoint…':assembling?'Обновляем 3D-модель…':'';
 async function addToSpecification(){
  if(!specification||isFavorite||savingSpecification||pending||assembling||!model||!capturePhoto.current||!cabinetData||!firstModel||!price)return;
  setSavingSpecification(true);
  setError('');
  try{
   const dimensions=cabinetBounds(model).dimensions;
   const finishes=cabinetSpecificationFinishes(configuration,cabinetData);
   const modules=configuration.modules.map((module,index)=>{
    const entry=cabinetData.models.find(item=>item.id===module.model)!;
    const type=entry.fixedFront?'Прозрачный стеклянный фасад':entry.categories?.includes('drawers')?'Модуль с ящиками':cabinetTitles[entry.categories?.[0]||'']||'Модуль комода';
    return {article:entry.id,type,size:{width:entry.widthMm,height:entry.heightMm,depth:entry.depthMm},finishes:finishes[index]};
   });
   updateFurnitureSurfaces(parts,{},null,null);
   setSelected(null);
   const photos=await capturePhoto.current(dimensions);
   await saveCabinetSpecification({
    scope:specificationScope,fingerprint,createdAt:Date.now(),name:cabinetTitles[firstModel.categories?.[0]||'']||'Комод',
    size:{width,height:Math.round(dimensions[1]*1000),depth:Math.round(dimensions[2]*1000)},modules,support:supportLabel,photos,
    price:'priceInCents' in price?retailCurrency.format(price.priceInCents!/100):'Цена по запросу',
    priceNote:'priceInCents' in price?(price.estimated?'Предварительная цена':undefined):price.reason,
   });
   setSpecification(await loadCabinetSpecification(specificationScope));
  }catch(cause){
   setError((cause as Error).message||'Не удалось сохранить комод в спецификации.');
  }finally{
   setSavingSpecification(false);
  }
 }
 async function downloadSpecification(){
  if(!specification?.length)return;
  setError('');
  setPreparingSpecification(true);
  try{
   const legacy=specification.some(item=>item.modules.some(module=>!module.finishes));
   const catalog=legacy?(cabinetData||await cabinetCatalog().catch(()=>null)):null;
   const items=catalog?specification.map(item=>restoreCabinetSpecificationFinishes(item,catalog)):specification;
   const {downloadCabinetSpecification}=await import('./cabinet-specification-pptx');
   await downloadCabinetSpecification(items);
  }catch(cause){
   setError((cause as Error).message||'Не удалось подготовить коммерческое предложение PowerPoint.');
  }finally{
   setPreparingSpecification(false);
  }
 }
 function renderSample(sample:Sample){
  const missingSlab=ceramicFrontChosen&&(!sample.slabWidthMm||!sample.slabHeightMm);
  const chosen=cabinet?(cabinetPart==='front'?currentFront?.sample:selectedGlass.sample):selectedSample;
  const glassFinish=cabinetPart==='front'?currentFront?.finish:selectedGlass.finish;
  const label=cabinet&&sample.kind==='glass'?sample.label+' · '+glassCabinetArticle(sample.id,glassFinish):sample.label;
  return <button key={sample.id} type="button" disabled={(!cabinet&&!selected)||pending||assembling||missingSlab}
   title={missingSlab?'Размер слэба не подтверждён':undefined} aria-pressed={chosen===sample.id}
   onClick={()=>applySample(sample.id)}><img src={sample.image} alt="" loading="lazy"/><span>{label}</span></button>;
 }
 const max=Math.max(...aspect);
 function toggleDimensions(){
  if(!showDimensions&&dimensionControls.current){
   const controls=dimensionControls.current,camera=controls.object;
   const centre=new Vector3(0,aspect[1]/max/2,0);
   const direction=camera.position.clone().sub(controls.target).normalize();
   const vertical=camera.fov*Math.PI/180;
   const horizontal=2*Math.atan(Math.tan(vertical/2)*camera.aspect);
   const radius=Math.hypot(...aspect.map((value:number)=>value/max))/2+.25;
   const distance=radius/Math.sin(Math.min(vertical,horizontal)/2);
   camera.position.copy(centre).add(direction.multiplyScalar(distance));
   controls.target.copy(centre);
   controls.update();
  }
  setShowDimensions(value=>!value);
 }
 return <dialog ref={dialog} className={'rd-furniture-surface-editor'+(cabinet?' rd-cabinet-editor':'')} aria-label="Редактор текстур мебели" onKeyDownCapture={event=>{
  const deleteKey=event.key==='Delete'||event.key==='Backspace';
  if(!cabinet||!deleteKey||event.altKey||event.ctrlKey||event.metaKey||(event.target instanceof Element&&event.target.closest('input,textarea,select,[role="combobox"],[role="listbox"],[contenteditable="true"]')))return;
  event.preventDefault();
  event.stopPropagation();
  if(!event.repeat)removeActiveModule();
 }} onCancel={event=>{event.preventDefault();if(!pending)onClose();}}>
  <header className={cabinet?'rd-cabinet-bar':undefined}>
   {cabinet&&<><span className="rd-cabinet-wordmark">ROOM DESIGN</span><h2>Конфигуратор мебели</h2></>}
   <button type="button" disabled={pending} onClick={onClose}>Назад к плану</button>
   {cabinet?<div className="rd-cabinet-category"><span>Тип товара</span><CabinetSelect label="Тип товара" value={category}
    onChange={browseCategory} options={Object.entries(cabinetCategoryLabels).map(([value,label])=>({value,label}))}/></div>:<h2>{node?.name||'TETRA'}</h2>}
   {cabinet&&<button type="button" className="rd-cabinet-print" aria-label="Скачать коммерческое предложение PowerPoint" title={specification?.length?'Скачать PowerPoint':'Добавьте комод в спецификацию'} disabled={!specification?.length||savingSpecification||preparingSpecification} onClick={()=>void downloadSpecification()}>▤</button>}
   <button type="button" disabled={pending||assembling||(emptyCabinet?!!creation:!model)} onClick={()=>void confirm()}>{emptyCabinet&&!creation?'Удалить изделие':cabinet?'Сохранить':'ОК'}</button>
  </header>
  <div className={cabinet?'rd-cabinet-workspace':'rd-furniture-texture-workspace'}>
  <aside className={cabinet?'rd-cabinet-sidebar':undefined}>
  {cabinet&&<nav className="rd-cabinet-tabs" aria-label="Настройки комода">
   {cabinetPanels.filter(([panel])=>panel!=='support'||supportsAvailable).map(([panel,label])=>
    <button type="button" key={panel} aria-pressed={cabinetPanel===panel} disabled={emptyCabinet&&panel!=='modules'} onClick={()=>openCabinetPanel(panel)}>{label}</button>)}
  </nav>}
  <div className={cabinet?'rd-cabinet-panel':undefined} ref={cabinet?cabinetPanelContent:undefined}>
  {cabinet&&<div className="rd-furniture-texture-status">{error?<span role="alert">{error}</span>:<span role="status">{cabinetStatus}</span>}</div>}
  {cabinet&&cabinetPanel==='modules'&&<section className="rd-cabinet-controls" aria-label="Состав и каталог модулей">
   <div className="rd-cabinet-module-heading">
    <h3>Состав</h3>
    {cabinetData&&<small>{emptyCabinet?'Добавьте модуль из каталога':`Общая ширина ${width/10}${standalone?'':' / 260'} см`}</small>}
   </div>
   <div className="rd-cabinet-modules">
    {configuration.modules.map((module,index)=>{
     const dimensions=cabinetData?.models.find(item=>item.id===module.model);
     return <button type="button" key={module.id} aria-pressed={module.id===activeModule} onClick={()=>{setActiveModule(module.id);setFrontIndex(null);setSelected(null);setAllModules(false);}}>
      {dimensions?.thumbnail&&<img src={cabinetURL(dimensions.thumbnail)} alt=""/>}
      <b>Модуль {index+1}</b><small>{dimensions?dimensions.widthMm/10+' см · ':''}арт. {module.model}</small>
     </button>;
    })}
   </div>
   <div className="rd-cabinet-library">
   <div className="rd-cabinet-size-filters">
    <div className="rd-cabinet-height-filter"><span>Высота корпуса</span><CabinetSelect label="Высота корпуса" value={String(catalogHeight)}
     options={heights.map(height=>({value:String(height),label:height/10+' см'}))} onChange={value=>{
      const height=Number(value);setCatalogHeight(height);setCatalogDepth(catalogueModels.find(item=>item.heightMm===height)?.depthMm||450);setCatalogWidth('all');
     }}/></div>
    <div><span>Ширина</span><CabinetSelect label="Ширина модуля" value={catalogWidth} onChange={setCatalogWidth}
     options={[{value:'all',label:'Все размеры'},...widths.map(width=>({value:String(width),label:width/10+' см'}))]}/></div>
    <div><span>Глубина</span><CabinetSelect label="Глубина модуля" value={String(catalogDepth)}
     options={depths.map(depth=>({value:String(depth),label:depth/10+' см'}))}
     onChange={value=>{setCatalogDepth(Number(value));setCatalogWidth('all');}}/></div>
   </div>
   {!emptyCabinet&&!standalone&&!browsingStandalone&&<div className="rd-cabinet-catalog-actions">
    <button type="button" aria-pressed={moduleAction==='replace'} onClick={()=>setModuleAction('replace')}>Заменить</button>
    <button type="button" aria-pressed={moduleAction==='add'} onClick={()=>setModuleAction('add')}>Добавить</button>
   </div>}
   {browsingStandalone&&configuration.modules.length>1&&<p>Оставьте один модуль, чтобы заменить его настенным шкафом или баром.</p>}
   <div className="rd-cabinet-model-cards">
    {shownModels.map(item=>{
     const replacedWidth=replacing?(activeModel?.widthMm||0):0;
     const tooWide=width-replacedWidth+item.widthMm>Math.min(MAX_CABINET_WIDTH_MM,configuration.frontType==='glass'||standalone||browsingStandalone||item.fixedFront?MAX_CABINET_WIDTH_MM:cabinetData.samples.find(sample=>sample.id===configuration.front)?.slabWidthMm||MAX_CABINET_WIDTH_MM);
     const incompatible=configuration.modules.some(module=>{
      if(replacing&&module.id===activeModule)return false;
      const existing=cabinetData?.models.find(model=>model.id===module.model);
      return existing&&(isStandaloneCabinet(item)||isStandaloneCabinet(existing)||existing.heightMm!==item.heightMm||existing.depthMm!==item.depthMm);
     });
     const missing=item.available3D===false;
     return <button type="button" key={item.id} disabled={pending||tooWide||incompatible||missing} aria-label={(!replacing?'Добавить':'Заменить на')+' модуль '+item.id} title={missing?'Ожидается 3D-модель по этой схеме':incompatible?'Высота и глубина должны совпадать с композицией':tooWide?'Достигнута максимальная ширина композиции':undefined} onClick={()=>chooseModule(item.id)}>
      {item.thumbnail&&<img src={cabinetURL(item.thumbnail)} alt="" loading="lazy"/>}
      <b>{item.fixedFront==='transparent-glass'?'Прозрачная дверца':'Модуль '+item.widthMm/10+' см'}</b><small>{item.widthMm/10} × {item.heightMm/10} × {item.depthMm/10} см</small><small>арт. {item.id}</small>{missing&&<small>Ожидается 3D</small>}
     </button>;
    })}
   </div>
   </div>
  </section>}
  {cabinet&&cabinetPanel==='finish'&&!emptyCabinet&&<section className="rd-cabinet-finish" aria-label="Отделка изделия">
   <h3>Отделка</h3>
   <div className="rd-cabinet-settings">
    {([['front','Фасад'],['body','Корпус']] as const).map(([part,label])=><button type="button" key={part} aria-pressed={part==='body'?glassSelected:cabinetPart===part} onClick={()=>{
     setCabinetPart(part);
     if(part!=='front'){setPartialFront(false);setFrontIndex(null);setSelected(null);}
    }}>{label}</button>)}
   </div>
    {cabinetPart==='front'&&canReplaceFront&&<button type="button" aria-pressed={partialFront} disabled={pending||assembling}
     onClick={togglePartialFront}>{partialFront?'Завершить частичную замену':'Частично заменить отделку'}</button>}
    {cabinetPart==='front'&&partialFront&&<p className="rd-cabinet-front-target" role="status">
     {waitingForFront?'Нажмите на фасад ящика или дверцы в 3D.':'Модуль '+(configuration.modules.findIndex(module=>module.id===activeModule)+1)+', фасад '+(frontIndex!+1)}
    </p>}
    {cabinetPart==='front'&&fixedTransparentFront&&<p className="rd-cabinet-fixed-front">{activeModel?.fixedFront?'Прозрачное стекло · заводской фасад':'Заводской фасад'}</p>}
    {cabinetPart==='front'&&!fixedTransparentFront&&!waitingForFront&&<div className="rd-cabinet-front-material">
     <button type="button" aria-pressed={!frontIsGlass} onClick={()=>chooseFrontType('ceramic')}>Керамогранит</button>
     <button type="button" aria-pressed={frontIsGlass} onClick={()=>chooseFrontType('glass')}>Стекло</button>
     {frontGlassSelected&&<><button type="button" aria-pressed={currentFront?.finish==='gloss'} onClick={()=>chooseFrontFinish({type:'glass',sample:currentFront?.sample||'WHT',finish:'gloss'})}>Глянцевое</button><button type="button" aria-pressed={currentFront?.finish==='matte'} onClick={()=>chooseFrontFinish({type:'glass',sample:currentFront?.sample||'WHT',finish:'matte'})}>Матовое</button></>}
    </div>}
    {glassSelected&&<>
     <div className="rd-cabinet-finish-field"><span>Часть корпуса</span><CabinetSelect label="Часть корпуса" value={cabinetPart}
      onChange={value=>setCabinetPart(value as GlassPart)} options={[
       {value:'body',label:'Весь корпус'},{value:'top',label:'Общая столешница'},
       {value:'left',label:'Левая боковина'},{value:'right',label:'Правая боковина'},
      ]}/></div>
     {(cabinetPart==='left'||cabinetPart==='right')&&moduleCount>1&&<div className="rd-cabinet-finish-field"><span>Модуль</span>
      <CabinetSelect label="Модуль" value={allModules?'all':activeModule||''}
       options={[{value:'all',label:'Все модули'},...configuration.modules.map((module,index)=>({value:module.id,label:'Модуль '+(index+1)+' · '+module.model}))]}
       onChange={id=>{setAllModules(id==='all');if(id!=='all')setActiveModule(id);setSelected(null);}}/></div>}
     <div className="rd-cabinet-front-material"><button type="button" aria-pressed={selectedGlass.finish==='gloss'} onClick={()=>changeGlass({finish:'gloss'})}>Глянцевое</button>{!transparentWall&&<button type="button" aria-pressed={selectedGlass.finish==='matte'} onClick={()=>changeGlass({finish:'matte'})}>Матовое</button>}</div>
    </>}
   {ceramicFrontChosen
    ?ceramicGroups.map(({group,samples})=>samples.length>0&&<section key={group} className="rd-cabinet-ceramic-group">
     <h4>Ценовая группа {group}</h4>
     <div className="rd-furniture-texture-samples">{samples.map(renderSample)}</div>
    </section>)
    :<div className="rd-furniture-texture-samples" role="group" aria-label="Образцы отделки">{visibleSamples.map(renderSample)}</div>}
  </section>}
  {cabinet&&cabinetPanel==='support'&&!emptyCabinet&&supportsAvailable&&<section aria-label="Опора изделия">
    <h3>Опора</h3>
    <div className="rd-cabinet-support">
     {bar&&<button type="button" aria-pressed={configuration.support?.kind==='none'} disabled={pending}
      onClick={()=>setCabinetConfiguration({...configuration,support:{kind:'none'}})}>Без опоры</button>}
     {cabinetData?.supports?.map(support=>{
      const models=configuration.modules.map(module=>cabinetData.models.find(item=>item.id===module.model)!);
      const amount=cabinetSupportPrice(support.id,width,models);
      const available=amount!==null&&(support.id==='BS'||support.id==='WL'||cabinetData.legs?.some(leg=>leg.id===support.id));
      const chosen=support.id==='BS'?configuration.support?.kind==='base':support.id==='WL'?configuration.support?.kind==='WL':configuration.support?.kind==='legs'&&configuration.support?.legId===support.id;
      return <button type="button" key={support.id} className="rd-cabinet-support-card" disabled={!available} aria-pressed={chosen} onClick={()=>setCabinetConfiguration({...configuration,support:support.id==='BS'?{kind:'base'}:support.id==='WL'?{kind:'WL'}:{kind:'legs',legId:support.id,color:metalFinish}})}>
       <img src={cabinetURL(support.thumbnail)} alt="" loading="lazy"/><b>{support.label}</b><span>{support.heightMm? support.heightMm/10+' см':'Настенное крепление'}</span>
       {support.id==='BS'&&<span><i style={{background:'#45464a'}}/>Тёмно-серая</span>}
       {!available&&<small>Для этой ширины по запросу</small>}
      </button>;
     })}
     {configuration.support?.kind==='legs'&&configuration.support.legId!=='GPLN'&&<fieldset className="rd-cabinet-metal-finishes" disabled={pending}>
      <legend>Отделка металла</legend>
      {cabinetData?.metalFinishes?.map(finish=><button type="button" key={finish.id} aria-pressed={metalFinish===finish.id} onClick={()=>setCabinetConfiguration({...configuration,support:{...configuration.support!,color:finish.id}})}>
       <img src={finish.image} alt=""/><span>{finish.label}</span><small>{finish.id}</small>
      </button>)}
     </fieldset>}
    </div>
  </section>}
  {!cabinet&&<><div className="rd-furniture-texture-samples" role="group" aria-label="Образцы отделки">{visibleSamples.map(renderSample)}</div>
  <div className="rd-furniture-texture-status">
   <button type="button" aria-pressed={wholeModel} disabled={!surfaces.length||pending} onClick={()=>setSelected(wholeModel?null:'all')}>Выделить всё</button>
   {error?<span role="alert">{error}</span>:<span role="status">{pending?'Применяем текстуры…':!model?'Загружаем модель и образцы…':wholeModel?'Выбрана вся модель. Нажмите на образец.':selected?'Поверхность выбрана. Нажмите на образец.':'Кликните по поверхности. Перетаскивайте модель, чтобы посмотреть с другой стороны.'}</span>}
   {selection.some(surface=>draft[surface])&&<button type="button" disabled={pending} onClick={resetSelection}>{wholeModel?'Сбросить отделку модели':'Сбросить поверхность'}</button>}
  </div></>}
  </div>
  </aside>
  <div className={'rd-furniture-texture-viewport'+(cabinet?' rd-cabinet-viewport':'')}>
   {cabinet&&
    <div className="rd-cabinet-view-tools">
     <button type="button" className="rd-cabinet-ruler" aria-label={showDimensions?'Скрыть размеры комода':'Показать размеры комода'} title={showDimensions?'Скрыть размеры':'Показать размеры'} aria-pressed={showDimensions} disabled={!model} onClick={toggleDimensions}>
      <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 16 13-13 5 5L8 21zM7 12l2 2m2-6 2 2"/></svg>
     </button>
     <div className="rd-cabinet-specification-tools">
      <button type="button" className="rd-cabinet-favorite" aria-label={isFavorite?'Комод в спецификации':'Добавить комод в избранное и спецификацию'} title={isFavorite?'Комод в спецификации':'Добавить в избранное и спецификацию'} aria-pressed={isFavorite} disabled={!photoReady||!specification||pending||assembling||savingSpecification} onClick={()=>void addToSpecification()}>
       <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden="true" strokeWidth="1.5" strokeLinejoin="round"><path d="M12 21 3.8 13a5.3 5.3 0 0 1 7.5-7.5l.7.7.7-.7a5.3 5.3 0 0 1 7.5 7.5Z"/></svg>
      </button>
      {!!specification?.length&&<span className="rd-cabinet-specification-count" role="status" aria-label={`Товаров в спецификации: ${specification.length}`}>{specification.length}</span>}
     </div>
     {showDimensions&&firstModel&&<p>Ширина {width/10} см · Корпус {firstModel.heightMm/10} см · Глубина {firstModel.depthMm/10} см</p>}
    </div>}
   {model&&<Canvas camera={{position:[1.65,1.18,1.9],fov:33}} dpr={[1,1.5]} onPointerMissed={()=>setSelected(null)}>
    {!cabinet&&<color attach="background" args={['white']}/>}<ambientLight intensity={1.9}/><directionalLight position={[3,4,2]} intensity={2}/>
    {cabinet&&<Environment resolution={128}><Lightformer intensity={2} position={[0,3,1]} rotation={[Math.PI/2,0,0]} scale={[4,3,1]}/><Lightformer intensity={1.2} position={[-3,1,2]} rotation={[0,Math.PI/2,0]} scale={[2,3,1]}/></Environment>}
    <group scale={(cabinet?[1/max,1/max,1/max]:aspect.map((axis:number)=>axis/max)) as [number,number,number]} onClick={pick}><primitive object={model}/>{cabinet&&showDimensions&&<group name="cabinet-measurements"><CabinetDimensions dimensions={aspect as [number,number,number]}/></group>}</group>
    {cabinet&&<CabinetPhoto capture={capturePhoto} onReady={setPhotoReady}/>}
    <OrbitControls ref={dimensionControls} makeDefault target={[0,aspect[1]/max/2,0]} minDistance={.65} maxDistance={5}/>
   </Canvas>}
   {cabinet&&<footer className="rd-cabinet-view-footer">
    {cabinetData&&!emptyCabinet&&<span>{moduleCount} {moduleLabel}{supportLabel?' · '+supportLabel:''}</span>}
    {price&&<output aria-live="polite" className="rd-cabinet-price">
     {'priceInCents' in price?<>
      <small>{price.estimated?'Предварительная цена':'Стоимость композиции'}</small>
      <strong>{retailCurrency.format(price.priceInCents!/100)}</strong>
      {price.estimated&&<small>Корпус рассчитан по более дорогой группе отделки</small>}
     </>:<><strong className="rd-cabinet-price-on-request">Цена по запросу</strong><small>{price.reason}</small></>}
    </output>}
   </footer>}
  </div>
  </div>
 </dialog>;
}
