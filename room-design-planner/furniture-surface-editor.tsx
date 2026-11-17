import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Canvas, type ThreeEvent} from '@react-three/fiber';
import {Environment,Lightformer,OrbitControls} from '@react-three/drei';
import {loadAssetUrl, saveAsset, useScene, emitter} from '@pascal-app/core';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Box3, Color, Group, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3} from 'three';
import {CABINET_PRODUCT,cabinetCatalog,assembleCabinets,newCabinet,cabinetBounds,cabinetURL,normalizeCabinetConfig,cabinetWidthMm,type CabinetConfig,type CabinetCatalog,type GlassPart} from './modular-cabinets';
import {MAX_CABINET_WIDTH_MM,slabCut} from './cabinet-layout.mjs';
import {CabinetDimensions} from './cabinet-dimensions';
import {furnitureSurfaces,updateFurnitureSurfaces} from './furniture-surface-geometry.mjs';

export const TETRA_PRODUCT = 'leve-home:334625_819';
type Sample = {id:string;label:string;image:string};
type Draft = Record<string,string>;
type CatalogRequest = (productId:string, options:{surfaceEditing:true})=>Promise<{textures:Sample[]}>;
const catalogId = (node:any) => node?.metadata?.catalogProductId || node?.metadata?.roomDesignFurniture?.catalog?.id;

export function FurnitureSurfaceMenu({requestCatalog,onOpenChange}:{requestCatalog:CatalogRequest;onOpenChange:(active:boolean)=>void}) {
 const [menu,setMenu]=useState<{id:string;x:number;y:number}|null>(null);
 const [target,setTarget]=useState<string|null>(null);
 useEffect(()=>{onOpenChange(!!target);return()=>onOpenChange(false);},[target,onOpenChange]);
 useEffect(()=>{
  let point={x:20,y:60};
  const remember=(event:MouseEvent)=>{point={x:event.clientX,y:event.clientY};};
  const open=(id:string)=>{const node=useScene.getState().nodes[id as any];setMenu([TETRA_PRODUCT,CABINET_PRODUCT].includes(catalogId(node))?{id,...point}:null);};
  const native=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.type==='menu')open(detail.id);};
  const scene=(event:any)=>{if(![TETRA_PRODUCT,CABINET_PRODUCT].includes(catalogId(event.node)))return;event.stopPropagation?.();open(event.node.id);};
  const close=(event:PointerEvent)=>{if(event.button===0&&event.target instanceof HTMLCanvasElement)setMenu(null);};
  const configure=(event:Event)=>setTarget((event as CustomEvent).detail.id);
  window.addEventListener('roomdesign:configure-cabinet',configure);
  window.addEventListener('contextmenu',remember,true);
  window.addEventListener('roomdesign:item-interaction',native);
  window.addEventListener('pointerdown',close,true);
  emitter.on('node:context-menu',scene);
  return()=>{window.removeEventListener('roomdesign:configure-cabinet',configure);window.removeEventListener('contextmenu',remember,true);window.removeEventListener('roomdesign:item-interaction',native);window.removeEventListener('pointerdown',close,true);emitter.off('node:context-menu',scene);};
 },[]);
 return <>
  {menu&&<div className="rd-furniture-surface-menu" style={{left:Math.min(menu.x,innerWidth-184),top:Math.min(menu.y,innerHeight-56)}}>
   <button type="button" onClick={()=>{setTarget(menu.id);setMenu(null);}}>Добавить текстуру</button>
  </div>}
  {target&&<FurnitureSurfaceEditor key={target} id={target} requestCatalog={requestCatalog} onClose={()=>setTarget(null)}/>}
 </>;
}

function FurnitureSurfaceEditor({id,requestCatalog,onClose}:{id:string;requestCatalog:CatalogRequest;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const node=useScene.getState().nodes[id as any] as any;
 const cabinet=catalogId(node)===CABINET_PRODUCT;
 const [cabinetData,setCabinetData]=useState<CabinetCatalog|null>(null);
 const [configuration,setConfiguration]=useState<CabinetConfig>(()=>normalizeCabinetConfig(node?.metadata?.modularCabinet||{modules:[newCabinet()]}));
 const [activeModule,setActiveModule]=useState(configuration.modules[0]?.id);
 const [cabinetPart,setCabinetPart]=useState<'front'|'body'|'top'|'left'|'right'|'legs'>('front');
 const [allModules,setAllModules]=useState(false);
 const [assembling,setAssembling]=useState(cabinet);
 const [catalogHeight,setCatalogHeight]=useState(390),[catalogWidth,setCatalogWidth]=useState('all'),[catalogDepth,setCatalogDepth]=useState(450);
 const [showDimensions,setShowDimensions]=useState(false);
 const dimensionControls=useRef<any>(null);
 const [moduleAction,setModuleAction]=useState<'add'|'replace'>('add');
 const [samples,setSamples]=useState<Sample[]>([]);
 const [model,setModel]=useState<Group|null>(null);
 const [parts,setParts]=useState<ReturnType<typeof furnitureSurfaces>>([]);
 const [draft,setDraft]=useState<Draft>(node?.metadata?.surfaceTextureDraft||{});
 const [selected,setSelected]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [pending,setPending]=useState(false);
 const materials=useRef(new Map<string,MeshStandardMaterial>());
 const highlight=useRef(new MeshStandardMaterial({color:'#ede1dc',emissive:'#82364b',emissiveIntensity:.3}));

 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 useEffect(()=>{
  let active=true;
  async function load() {
   if(cabinet){const data=await cabinetCatalog();if(active){setCabinetData(data);setSamples(data.samples);const first=data.models.find(item=>item.id===configuration.modules[0]?.model);if(first){setCatalogHeight(first.heightMm);setCatalogDepth(first.depthMm);}}return;}
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
 },[cabinet,cabinetData,configuration]);

 function setCabinetConfiguration(next:CabinetConfig){
  try{
   if(cabinetData){
    slabCut(next,cabinetData);
    const missing=next.modules.find(module=>cabinetData.models.find(item=>item.id===module.model)?.available3D===false);
    if(missing)throw Error('Для модуля '+missing.model+' ещё не подключена 3D-модель.');
   }
   setConfiguration(next);
   setError('');
   return true;
  }catch(reason){setError((reason as Error).message);return false;}
 }
 function changeModule(patch:Partial<CabinetConfig['modules'][number]>){
  if(patch.front){setCabinetConfiguration({...configuration,front:patch.front});return;}
  setCabinetConfiguration({...configuration,modules:configuration.modules.map(module=>
   module.id===activeModule||allModules?{...module,...patch}:module)});
 }
 function chooseFrontType(type:'ceramic'|'glass'){
  if(fixedTransparentFront)return;
  const next={...configuration,frontType:type};
  if(type==='ceramic'&&cabinetData){
   const width=cabinetWidthMm(configuration,cabinetData);
   const current=cabinetData.samples.find(sample=>sample.id===configuration.front);
   if(!current?.slabWidthMm||current.slabWidthMm<width){
    const suitable=cabinetData.samples.find(sample=>sample.kind==='ceramic'&&(sample.slabWidthMm||0)>=width);
    if(suitable)next.front=suitable.id;
   }
  }
  setCabinetConfiguration(next);
 }
 function changeGlass(patch:{sample?:string;finish?:'gloss'|'matte'}){
  if(cabinetPart==='top'){
   setCabinetConfiguration({...configuration,top:{...configuration.top!,...patch}});
   return;
  }
  setCabinetConfiguration({...configuration,modules:configuration.modules.map(module=>{
   if(module.id!==activeModule&&!allModules)return module;
   if(cabinetPart==='body')return {...module,...(patch.sample?{glass:patch.sample}:{}),...(patch.finish?{finish:patch.finish}:{}),surfaces:{}};
   const part=cabinetPart as GlassPart,previous=module.surfaces?.[part]||{sample:module.glass,finish:module.finish};
   return {...module,surfaces:{...module.surfaces,[part]:{...previous,...patch}}};
  })});
 }
 function addModule(model:string){
  const module=newCabinet(model);
  const next={...configuration,modules:[...configuration.modules,module]};
  if(setCabinetConfiguration(next)){setActiveModule(module.id);setAllModules(false);}
 }
 const activeCabinet=configuration.modules.find(module=>module.id===activeModule);
 const fixedTransparentFront=cabinetData?.models.find(item=>item.id===activeCabinet?.model)?.fixedFront==='transparent-glass';
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
   if(pending||assembling||cabinetPart==='front'&&fixedTransparentFront)return;
   if(cabinetPart==='front'){
    if(configuration.frontType==='glass')setCabinetConfiguration({...configuration,frontGlass:{...configuration.frontGlass!,sample:sampleId}});
    else changeModule({front:sampleId});
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
  if(model)updateFurnitureSurfaces(parts,cabinet?{}:draftMaterials(),selected&&draft[selected]?null:selected,highlight.current);
 },[model,parts,draft,selected]);

 function pick(event:ThreeEvent<MouseEvent>) {
  if(event.delta>4||event.faceIndex==null)return;
  const part=parts.find(part=>part.mesh===event.object);
  if(!part)return;
  event.stopPropagation();
  setSelected(part.faceIds[event.faceIndex]);
  if(cabinet&&event.object.userData.cabinetModule){
   setActiveModule(event.object.userData.cabinetModule);
   setCabinetPart(event.object.userData.cabinetPart);
   setAllModules(false);
  }
 }

 async function confirm() {
  if(!model||pending)return;
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
   const buffer=await new GLTFExporter().parseAsync(exported,{binary:true});
   if(!(buffer instanceof ArrayBuffer))throw Error('Не удалось подготовить модель с текстурами');
   const assetRef=await saveAsset(new File([buffer],cabinet?'modular-cabinet.glb':'tetra-surface-textures.glb',{type:'model/gltf-binary'}));
   const src=await loadAssetUrl(assetRef);
   const current=useScene.getState().nodes[id as any] as any;
   if(!current||!src)throw Error('Не удалось применить текстуры к предмету');
   useScene.getState().updateNode(id as any,{
    asset:{...current.asset,src,...(cabinet?{dimensions:[1,1,1]}:{}),id:`catalog-surface-${id}-${crypto.randomUUID()}`},
    ...(dimensions?{scale:dimensions}:{}),
    metadata:{...current.metadata,...(cabinet?{modularCabinet:configuration}:{}),roomDesignModelAsset:assetRef,surfaceTextureBase:node.metadata.surfaceTextureBase||node.metadata.roomDesignModelAsset,surfaceTextureDraft:draft},
   } as any);
   onClose();
  } catch(reason) {
   setError((reason as Error).message);
   setPending(false);
  }
 }

 const aspect=cabinet&&model?cabinetBounds(model).dimensions:node?.scale||[1.4,.55,.4];
 const selectedGlass=cabinetPart==='top'?configuration.top!:activeCabinet?.surfaces?.[cabinetPart as GlassPart]||{sample:activeCabinet?.glass,finish:activeCabinet?.finish};
 const glassSelected=['body','top','left','right'].includes(cabinetPart);
 const frontIsGlass=configuration.frontType==='glass';
 const frontGlassSelected=cabinetPart==='front'&&frontIsGlass;
 const visibleSamples=cabinet&&cabinetPart==='front'&&fixedTransparentFront?[]:cabinet?samples.filter(sample=>(sample as any).kind===(cabinetPart==='front'&&!frontIsGlass?'ceramic':'glass')):samples;
 const catalogueModels=cabinetData?.models.filter(item=>!item.id.startsWith('base'))||[];
 const heights=[...new Set(catalogueModels.map(item=>item.heightMm))].sort((a,b)=>a-b);
 const depths=[...new Set(catalogueModels.filter(item=>item.heightMm===catalogHeight).map(item=>item.depthMm))].sort((a,b)=>a-b);
 const widths=[...new Set(catalogueModels.filter(item=>item.heightMm===catalogHeight&&item.depthMm===catalogDepth).map(item=>item.widthMm))].sort((a,b)=>a-b);
 const shownModels=catalogueModels.filter(item=>item.heightMm===catalogHeight&&item.depthMm===catalogDepth&&(catalogWidth==='all'||item.widthMm===Number(catalogWidth))).sort((a,b)=>Number(a.available3D===false)-Number(b.available3D===false)||a.widthMm-b.widthMm||a.id.localeCompare(b.id,undefined,{numeric:true}));
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
 return <dialog ref={dialog} className={'rd-furniture-surface-editor'+(cabinet?' rd-cabinet-editor':'')} aria-label="Редактор текстур мебели" onCancel={event=>{event.preventDefault();if(!pending)onClose();}}>
  <header><button type="button" disabled={pending} onClick={onClose}>Назад к плану</button><h2>{node?.name||'TETRA'}</h2><button type="button" disabled={!model||pending||assembling} onClick={()=>void confirm()}>ОК</button></header>
  <div className={cabinet?'rd-cabinet-workspace':'rd-furniture-texture-workspace'}>
  <aside className={cabinet?'rd-cabinet-sidebar':undefined}>
  {cabinet&&<div className="rd-cabinet-controls">
   <div className="rd-cabinet-summary"><small>Максимальная ширина 260 см</small></div>
   <div className="rd-cabinet-modules">
    {configuration.modules.map((module,index)=>{
     const dimensions=cabinetData?.models.find(item=>item.id===module.model);
     return <button type="button" key={module.id} aria-pressed={module.id===activeModule} onClick={()=>{setActiveModule(module.id);setAllModules(false);}}>
      <img src={cabinetURL(dimensions?.thumbnail||module.model+'-catalog.png')} alt=""/>
      <b>Модуль {index+1}</b><span>{dimensions?dimensions.widthMm/10+' см':''}</span>
     </button>;
    })}
   </div>
   {configuration.modules.length>1&&<button type="button" className="rd-cabinet-remove" onClick={()=>{const next=configuration.modules.filter(module=>module.id!==activeModule);setCabinetConfiguration({...configuration,modules:next});setActiveModule(next[0].id);}}>Убрать выбранный модуль</button>}
   <div className="rd-cabinet-size-filters">
    <label className="rd-cabinet-height-filter">Высота корпуса<select aria-label="Высота корпуса" value={catalogHeight} onChange={event=>{const height=Number(event.target.value);setCatalogHeight(height);setCatalogDepth(catalogueModels.find(item=>item.heightMm===height)?.depthMm||450);setCatalogWidth('all');}}>{heights.map(height=><option key={height} value={height}>{height/10} см</option>)}</select></label>
    <label>Ширина<select aria-label="Ширина модуля" value={catalogWidth} onChange={event=>setCatalogWidth(event.target.value)}><option value="all">Все размеры</option>{widths.map(width=><option key={width} value={width}>{width/10} см</option>)}</select></label>
    <label>Глубина<select aria-label="Глубина модуля" value={catalogDepth} onChange={event=>{setCatalogDepth(Number(event.target.value));setCatalogWidth('all');}}>{depths.map(depth=><option key={depth} value={depth}>{depth/10} см</option>)}</select></label>
   </div>
   <div className="rd-cabinet-catalog-actions">
    <button type="button" aria-pressed={moduleAction==='add'} onClick={()=>setModuleAction('add')}>Добавить модуль</button>
    <button type="button" aria-pressed={moduleAction==='replace'} onClick={()=>setModuleAction('replace')}>Заменить выбранный</button>
   </div>
   <div className="rd-cabinet-model-cards">
    {shownModels.map(item=>{
     const tooWide=moduleAction==='add'&&cabinetWidthMm(configuration,cabinetData)+item.widthMm>Math.min(MAX_CABINET_WIDTH_MM,frontIsGlass?MAX_CABINET_WIDTH_MM:cabinetData.samples.find(sample=>sample.id===configuration.front)?.slabWidthMm||MAX_CABINET_WIDTH_MM);
     const incompatible=configuration.modules.some(module=>{
      if(moduleAction==='replace'&&module.id===activeModule)return false;
      const existing=cabinetData?.models.find(model=>model.id===module.model);
      return existing&&(existing.heightMm!==item.heightMm||existing.depthMm!==item.depthMm);
     });
     const missing=item.available3D===false;
     return <button type="button" key={item.id} className={missing?undefined:'rd-cabinet-model-ready'} disabled={pending||tooWide||incompatible||missing} aria-label={(moduleAction==='add'?'Добавить':'Заменить на')+' модуль '+item.id} title={missing?'Ожидается 3D-модель по этой схеме':incompatible?'Высота и глубина должны совпадать с композицией':tooWide?'Достигнута максимальная ширина композиции':undefined} onClick={()=>moduleAction==='add'?addModule(item.id):changeModule({model:item.id})}>
      <img src={cabinetURL(item.thumbnail||item.id+'-preview.svg')} alt={'Комод '+item.widthMm/10+' × '+item.heightMm/10+' × '+item.depthMm/10+' см'}/>
      <span>Модуль {item.widthMm/10} см</span><span className="rd-cabinet-card-dimensions">{item.widthMm/10} × {item.heightMm/10} × {item.depthMm/10} см</span><small>Артикул {item.id}</small>{item.fixedFront==='transparent-glass'&&<span className="rd-cabinet-transparent-badge">Прозрачная дверца</span>}{missing?<em>Ожидается 3D</em>:<b className="rd-cabinet-3d-badge">3D</b>}
     </button>;
    })}
   </div>
   <div className="rd-cabinet-settings">
    {([['front','Фасад'],['body','Корпус · стекло'],['legs','Опора']] as const).map(([part,label])=><button type="button" key={part} aria-pressed={part==='body'?glassSelected:cabinetPart===part} onClick={()=>setCabinetPart(part)}>{label}</button>)}
    {cabinetPart==='front'&&fixedTransparentFront&&<p className="rd-cabinet-fixed-front">Прозрачное стекло · заводской фасад</p>}
    {cabinetPart==='front'&&!fixedTransparentFront&&<div className="rd-cabinet-front-material">
     <button type="button" aria-pressed={!frontIsGlass} onClick={()=>chooseFrontType('ceramic')}>Керамогранит</button>
     <button type="button" aria-pressed={frontIsGlass} onClick={()=>chooseFrontType('glass')}>Стекло</button>
     {frontGlassSelected&&<><button type="button" aria-pressed={configuration.frontGlass?.finish==='gloss'} onClick={()=>setCabinetConfiguration({...configuration,frontGlass:{...configuration.frontGlass!,finish:'gloss'}})}>Глянцевое</button><button type="button" aria-pressed={configuration.frontGlass?.finish==='matte'} onClick={()=>setCabinetConfiguration({...configuration,frontGlass:{...configuration.frontGlass!,finish:'matte'}})}>Матовое</button></>}
    </div>}
    {glassSelected&&<><select aria-label="Часть стеклянного корпуса" value={cabinetPart} onChange={event=>setCabinetPart(event.target.value as GlassPart)}><option value="body">Весь корпус</option><option value="top">Общая столешница</option><option value="left">Левая боковина</option><option value="right">Правая боковина</option></select><button type="button" aria-pressed={selectedGlass.finish==='gloss'} onClick={()=>changeGlass({finish:'gloss'})}>Глянцевое</button><button type="button" aria-pressed={selectedGlass.finish==='matte'} onClick={()=>changeGlass({finish:'matte'})}>Матовое</button></>}
    {cabinetPart==='legs'&&<div className="rd-cabinet-support">
     {cabinetData?.supports?.map(support=>{
      const available=support.id==='BS'||cabinetData.legs?.some(leg=>leg.id===support.id);
      const chosen=support.id==='BS'?configuration.support?.kind==='base':configuration.support?.kind==='legs'&&configuration.support?.legId===support.id;
      return <button type="button" key={support.id} className="rd-cabinet-support-card" disabled={!available} aria-pressed={chosen} onClick={()=>setCabinetConfiguration({...configuration,support:support.id==='BS'?{kind:'base'}:{kind:'legs',legId:support.id,color:configuration.support?.color||'#45464a'}})}>
       <img src={cabinetURL(support.thumbnail)} alt={support.label}/><b>{support.label}</b><span>{support.heightMm? support.heightMm/10+' см':'Настенное крепление'}</span>
       {support.id==='BS'&&<span><i style={{background:'#45464a'}}/>Тёмно-серая</span>}
       {!available&&<small>Ожидается 3D</small>}
      </button>;
     })}
     <small>{aspect[0]>2?'Отдельные ножки для этой ширины: 6 шт.':'Отдельные ножки для этой ширины: 4 шт.'}</small>
     {configuration.support?.kind==='legs'&&<label>Цвет металла <input type="color" aria-label="Цвет металла ножек" value={configuration.support.color||'#45464a'} onChange={event=>setCabinetConfiguration({...configuration,support:{...configuration.support!,color:event.target.value}})}/></label>}
    </div>}

   </div>
  </div>}
  <div className="rd-furniture-texture-samples"  role="group" aria-label="Текстуры из архива">
   {(cabinet&&cabinetPart==='legs'?[]:visibleSamples).map(sample=><button key={sample.id} type="button" disabled={(!cabinet&&!selected)||pending||assembling||(cabinet&&cabinetPart==='front'&&!frontIsGlass&&(!(sample as any).slabWidthMm||!(sample as any).slabHeightMm))} title={cabinet&&cabinetPart==='front'&&!frontIsGlass&&!(sample as any).slabWidthMm?'Размер слэба не подтверждён':undefined} aria-pressed={cabinet?(cabinetPart==='front'?(frontIsGlass?configuration.frontGlass?.sample:configuration.front):selectedGlass.sample)===sample.id:selectedSample===sample.id} onClick={()=>applySample(sample.id)}><img src={sample.image} alt=""/><span>{sample.label}{cabinet&&(sample as any).slabWidthMm?' · '+(sample as any).slabHeightMm/10+' × '+(sample as any).slabWidthMm/10+' см':''}</span></button>)}
  </div>
  <div className="rd-furniture-texture-status">
   <button type="button" aria-pressed={cabinet?allModules:wholeModel} disabled={!surfaces.length||pending} onClick={()=>cabinet?setAllModules(value=>!value):setSelected(wholeModel?null:'all')}>Выделить всё</button>
   {error?<span role="alert">{error}</span>:<span role="status">{pending?'Применяем текстуры…':cabinet?(assembling?'Обновляем комоды…':allModules?'Отделка применяется ко всем модулям.':'Выберите часть комода или нажмите на неё в 3D.'):!model?'Загружаем модель и образцы…':wholeModel?'Выбрана вся модель. Нажмите на образец.':selected?'Поверхность выбрана. Нажмите на образец.':'Кликните по поверхности. Перетаскивайте модель, чтобы посмотреть с другой стороны.'}</span>}
   {!cabinet&&selection.some(surface=>draft[surface])&&<button type="button" disabled={pending} onClick={resetSelection}>{wholeModel?'Сбросить отделку модели':'Сбросить поверхность'}</button>}
  </div>
  </aside>
  <div className="rd-furniture-texture-viewport">
   {cabinet&&<div className="rd-cabinet-view-tools">
    <button type="button" className="rd-cabinet-ruler" aria-label={showDimensions?'Скрыть размеры комода':'Показать размеры комода'} title={showDimensions?'Скрыть размеры':'Показать размеры'} aria-pressed={showDimensions} disabled={!model} onClick={toggleDimensions}>
     <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 16 13-13 5 5L8 21zM7 12l2 2m2-6 2 2m2-6 2 2"/></svg>
    </button>
    <strong>Композиция</strong>
   </div>}
   {model&&<Canvas camera={{position:[1.65,1.18,1.9],fov:33}} dpr={[1,1.5]} onPointerMissed={()=>setSelected(null)}>
    <color attach="background" args={['white']}/><ambientLight intensity={1.9}/><directionalLight position={[3,4,2]} intensity={2}/>
    {cabinet&&<Environment resolution={128}><Lightformer intensity={2} position={[0,3,1]} rotation={[Math.PI/2,0,0]} scale={[4,3,1]}/><Lightformer intensity={1.2} position={[-3,1,2]} rotation={[0,Math.PI/2,0]} scale={[2,3,1]}/></Environment>}
    <group scale={(cabinet?[1/max,1/max,1/max]:aspect.map((axis:number)=>axis/max)) as [number,number,number]} onClick={pick}><primitive object={model}/>{cabinet&&showDimensions&&<CabinetDimensions dimensions={aspect as [number,number,number]}/>}</group>
    <OrbitControls ref={dimensionControls} makeDefault target={[0,aspect[1]/max/2,0]} minDistance={.65} maxDistance={5}/>
   </Canvas>}
  </div>
  </div>
 </dialog>;
}
