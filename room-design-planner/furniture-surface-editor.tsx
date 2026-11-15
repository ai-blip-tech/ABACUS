import React, {useEffect,useMemo,useRef,useState} from 'react';
import {Canvas, type ThreeEvent} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {loadAssetUrl, saveAsset, useScene, emitter} from '@pascal-app/core';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Box3, Color, Group, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, Vector3} from 'three';
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
  const open=(id:string)=>{const node=useScene.getState().nodes[id as any];setMenu(catalogId(node)===TETRA_PRODUCT?{id,...point}:null);};
  const native=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail.type==='menu')open(detail.id);};
  const scene=(event:any)=>{if(catalogId(event.node)!==TETRA_PRODUCT)return;event.stopPropagation?.();open(event.node.id);};
  const close=(event:PointerEvent)=>{if(event.button===0&&event.target instanceof HTMLCanvasElement)setMenu(null);};
  window.addEventListener('contextmenu',remember,true);
  window.addEventListener('roomdesign:item-interaction',native);
  window.addEventListener('pointerdown',close,true);
  emitter.on('node:context-menu',scene);
  return()=>{window.removeEventListener('contextmenu',remember,true);window.removeEventListener('roomdesign:item-interaction',native);window.removeEventListener('pointerdown',close,true);emitter.off('node:context-menu',scene);};
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
  if(model)updateFurnitureSurfaces(parts,draftMaterials(),selected&&draft[selected]?null:selected,highlight.current);
 },[model,parts,draft,selected]);

 function pick(event:ThreeEvent<MouseEvent>) {
  if(event.delta>4||event.faceIndex==null)return;
  const part=parts.find(part=>part.mesh===event.object);
  if(!part)return;
  event.stopPropagation();
  setSelected(part.faceIds[event.faceIndex]);
 }

 async function confirm() {
  if(!model||pending)return;
  if(JSON.stringify(draft)===JSON.stringify(node.metadata.surfaceTextureDraft||{})){onClose();return;}
  setPending(true);setError('');
  try {
   const assignments=draftMaterials();
   await Promise.all([...new Set(Object.values(assignments))].map(async material=>{
    if(material.map?.image?.decode)await material.map.image.decode();
    else if(material.map&&!material.map.image){
     // TextureLoader may still be decoding; use the source image from the sample below.
     const sample=samples.find(item=>materials.current.get(item.id)===material);
     if(sample){const image=new Image();image.src=sample.image;await image.decode();material.map.image=image;material.map.needsUpdate=true;}
    }
   }));
   updateFurnitureSurfaces(parts,assignments,null,null);
   const buffer=await new GLTFExporter().parseAsync(model,{binary:true});
   if(!(buffer instanceof ArrayBuffer))throw Error('Не удалось подготовить модель с текстурами');
   const assetRef=await saveAsset(new File([buffer],'tetra-surface-textures.glb',{type:'model/gltf-binary'}));
   const src=await loadAssetUrl(assetRef);
   const current=useScene.getState().nodes[id as any] as any;
   if(!current||!src)throw Error('Не удалось применить текстуры к предмету');
   useScene.getState().updateNode(id as any,{
    asset:{...current.asset,src,id:`catalog-surface-${id}-${crypto.randomUUID()}`},
    metadata:{...current.metadata,roomDesignModelAsset:assetRef,surfaceTextureBase:node.metadata.surfaceTextureBase||node.metadata.roomDesignModelAsset,surfaceTextureDraft:draft},
   } as any);
   onClose();
  } catch(reason) {
   setError((reason as Error).message);
   setPending(false);
  }
 }

 const aspect=node?.scale||[1.4,.55,.4];
 const max=Math.max(...aspect);
 return <dialog ref={dialog} className="rd-furniture-surface-editor" aria-label="Редактор текстур мебели" onCancel={event=>{event.preventDefault();if(!pending)onClose();}}>
  <header><button type="button" disabled={pending} onClick={onClose}>Назад к плану</button><h2>{node?.name||'TETRA'}</h2><button type="button" disabled={!model||pending} onClick={()=>void confirm()}>ОК</button></header>
  <div className="rd-furniture-texture-samples" role="group" aria-label="Текстуры из архива">
   {samples.map(sample=><button key={sample.id} type="button" disabled={!selected||pending} aria-pressed={selectedSample===sample.id} onClick={()=>applySample(sample.id)}><img src={sample.image} alt=""/><span>{sample.label}</span></button>)}
  </div>
  <div className="rd-furniture-texture-status">
   <button type="button" aria-pressed={wholeModel} disabled={!surfaces.length||pending} onClick={()=>setSelected(wholeModel?null:'all')}>Выделить всё</button>
   {error?<span role="alert">{error}</span>:<span role="status">{pending?'Применяем текстуры…':!model?'Загружаем модель и образцы…':wholeModel?'Выбрана вся модель. Нажмите на образец.':selected?'Поверхность выбрана. Нажмите на образец.':'Кликните по поверхности. Перетаскивайте модель, чтобы посмотреть с другой стороны.'}</span>}
   {selection.some(surface=>draft[surface])&&<button type="button" disabled={pending} onClick={resetSelection}>{wholeModel?'Сбросить отделку модели':'Сбросить поверхность'}</button>}
  </div>
  <div className="rd-furniture-texture-viewport">
   {model&&<Canvas camera={{position:[1.65,1.18,1.9],fov:33}} dpr={[1,1.5]} onPointerMissed={()=>setSelected(null)}>
    <color attach="background" args={['white']}/><ambientLight intensity={1.9}/><directionalLight position={[3,4,2]} intensity={2}/>
    <group scale={aspect.map((axis:number)=>axis/max) as [number,number,number]} onClick={pick}><primitive object={model}/></group>
    <OrbitControls makeDefault target={[0,aspect[1]/max/2,0]} minDistance={.65} maxDistance={5}/>
   </Canvas>}
  </div>
 </dialog>;
}
