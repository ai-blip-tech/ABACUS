import type {WallCameraPose} from './wall-camera-pose';
import type {WallWalkPose} from '../lib/wall-decoration/surfaces';
import {setDecaroContext} from './decaro-context.mjs';
import {snapshotScene} from './scene-snapshot.mjs';
import {CABINET_PRODUCT,CABINET_GEOMETRY_VERSION,cabinetCatalog,assembleCabinets,newCabinet,cabinetBounds,normalizeCabinetConfig} from './modular-cabinets';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Group} from 'three';
import {registerTileProduct,tileProducts} from './tile-products.mjs';
const catalogModelJobs=new Map<string,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:any}>();
import {FurnitureSurfaceMenu,StandaloneCabinetConfigurator} from './furniture-surface-editor.tsx';
import {WallRegionIndicator} from './wall-region-indicator.tsx';
import {FloorSurfaces} from './floor-surfaces.tsx';
import {CameraCapture} from './camera-capture.tsx';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Editor,sceneLayout,useEditor} from '@pascal-app/editor';
import {builtinPlugin} from '@pascal-app/nodes';
import {loadPlugin,useScene,loadAssetUrl,saveAsset,nodeRegistry,emitter} from '@pascal-app/core';
import {furnitureDimensions,plannerFurnitureNode,planningToPlanner} from '../lib/planning-plan/planner-adapter';
import {planningFromPlanner} from '../lib/planning-plan/planner-sync';
import {furniturePositionInView,type FurnitureViewPose} from '../lib/planning-plan/furniture-view-placement';
import type {FurnitureItem} from '../lib/planning-plan/furniture';
import type {MeasureDoc} from '../lib/measured-plan/measure-model';
import {FurnitureViewCamera} from './furniture-view-camera';
import {EditorShortcuts} from './editor-shortcuts.tsx';
import {WalkCamera,WalkHud} from './walkthrough.tsx';
import {MouldingPaintBadge} from './orac-mouldings.tsx';
import {WallFinishScene,WallFinishPanel} from './wall-finishes.tsx';
import {WallWorkCamera} from './wall-work-camera.tsx';
import {WallProximity} from './wall-proximity.tsx';
import {DragControls} from './drag-controls';
import './style.css';
import './planning-bridge.css';
const bootstrap=loadPlugin(builtinPlugin),params=new URLSearchParams(location.search),session=params.get('session'),parentOrigin=params.get('parentOrigin')||'';
const allowed=new Set([location.origin]);
const send=(data:any)=>{if(allowed.has(parentOrigin))window.parent.postMessage({...data,session},parentOrigin);};
const sendWalkPose=(pose:WallWalkPose)=>send({type:'pascal:wall-walk-pose',pose});
function sceneSnapshot() { return snapshotScene(useScene.getState(),tileProducts); }
function requestCatalogModel(productId:string,options:{textureId?:string;surfaceEditing?:true}={}) {
 return new Promise<any>((resolve,reject)=>{
  const requestId=crypto.randomUUID();
  const timer=setTimeout(()=>{catalogModelJobs.delete(requestId);reject(Error('Истекло время подготовки модели'));},90000);
  catalogModelJobs.set(requestId,{resolve,reject,timer});
  send({type:'pascal:model-prepare',requestId,productId,...options});
 });
}
const textureEditorChanged=(active:boolean)=>send({type:'pascal:furniture-textures-open',active});
const defaults:Record<string,number>={chair:850,armchair:850,sofa:850,bed:900,wardrobe:2400,table:750,desk:750,kitchen:900,fridge:2000,bath:600,shower:2100,toilet:750,sink:850,ottoman:450,rug:10,lamp:1600,plant:1200,decor:300,shelf:2100,tv_stand:500,tv:700,nightstand:550,dresser:900};
const templateAsset=(kind:string)=>new URL(`${import.meta.env.BASE_URL}models/${kind}.glb`,location.origin).href;

async function prepareFurnitureModel(node:any,furniture?:FurnitureItem){
 const binding=furniture?.model3D;
 if(!furniture||!binding)return;
 if(!binding.url)return {warning:`${furniture.name}: ссылка на 3D-модель ещё недоступна; показано условное обозначение`};
 try{
  const prepared=await requestCatalogModel(binding.productId,{textureId:binding.textureId});
  const url=new URL(prepared.url,location.origin);
  if(url.origin!==location.origin||url.pathname!=='/api/catalog/model-asset')throw Error('Недопустимый адрес модели');
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('Файл недоступен');
  const bytes=await response.arrayBuffer();
  if(bytes.byteLength<12||bytes.byteLength>50*1024*1024||new DataView(bytes).getUint32(0,true)!==0x46546c67)throw Error('Некорректный GLB');
  const ref=await saveAsset(new File([bytes],binding.productId+'.glb',{type:'model/gltf-binary'}));
  const src=await loadAssetUrl(ref);
  if(!src)throw Error('Не удалось открыть подготовленную модель');
  node.asset={...node.asset,id:'catalog-'+binding.productId,src};
  node.metadata={...node.metadata,roomDesignModelAsset:ref,representation:'catalog-converted',
   catalogProductId:binding.productId,...(binding.textureId?{catalogTextureId:binding.textureId}:{})};
  return {ready:true,warning:prepared.warning?`${furniture.name}: ${prepared.warning}`:undefined};
 }catch(error){
  const message=error instanceof Error?error.message:'модель не загрузилась';
  return {warning:`${furniture.name}: ${message}; показано условное обозначение`};
 }
}

function App(){const [wallWorkspace,setWallWorkspace]=useState(false);const [wallWork,setWallWork]=useState<any>(null);const cameraHandoff=useRef<WallCameraPose|null>(null);const [viewMode,setViewMode]=useState<'3d'|'eye'>('3d'),[document,setDocument]=useState<any>(null);const [scene,setScene]=useState<any>(null),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[key,setKey]=useState(0),baseline=useRef<any>(null),newModelFocus=useRef<string|null>(null),opening=useRef(false),loaded=useRef(false),lastChange=useRef('');
 const readFurniturePose=useRef<(() => FurnitureViewPose)|null>(null);
 const furniturePose=useRef<FurnitureViewPose|null>(null);
 const sourcePlan=useRef<MeasureDoc|null>(null);
 const [cabinetSpecificationScope,setCabinetSpecificationScope]=useState('preview');

 function resolveFurniturePlacement(item:FurnitureItem,pose:FurnitureViewPose){
  if(!sourcePlan.current)throw Error('Дождитесь открытия 3D');
  const plan=planningFromPlanner(sourcePlan.current,sceneSnapshot(),baseline.current);
  if((plan.furniture?.length||0)>=500)throw Error('Можно добавить не более 500 предметов');
  return {plan,item:{...item,position:furniturePositionInView(plan,pose,item)}};
 }

 useEffect(()=>{useEditor.getState().setViewLayout(sceneLayout('3d'));},[]);
 useEffect(()=>{const receive=async(event:MessageEvent)=>{if(event.source!==window.parent||event.origin!==parentOrigin||event.data?.session!==session||!allowed.has(parentOrigin))return;const data=event.data;if(data.type==='roomdesign:model-prepared'){const job=catalogModelJobs.get(data.requestId);if(job){clearTimeout(job.timer);catalogModelJobs.delete(data.requestId);if(data.error)job.reject(Error(data.error));else job.resolve(data.result);}return;}
  if(data.type==='roomdesign:wall-zoom'){window.dispatchEvent(new CustomEvent('roomdesign:wall-zoom',{detail:data.action}));return;}if(data.type==='roomdesign:wall-work'){setWallWork(data.context||null);return;}
  if(data.type==='roomdesign:wall-tile-product'){window.dispatchEvent(new CustomEvent('roomdesign:wall-tile-product',{detail:data.product}));return;}
  if(data.type==='roomdesign:floor-update'){const store=useScene.getState(),slab:any=store.nodes['slab_roomdesign'];if(slab)store.updateNode(slab.id,{metadata:{...slab.metadata,roomDesignFloorRegions:data.regions,roomDesignFloorGeometry:data.geometry}} as any);return;}
  if(data.type==='roomdesign:remember-furniture-view'){
   furniturePose.current=loaded.current?readFurniturePose.current?.()||null:null;
   send({type:'pascal:furniture-view',requestId:data.requestId,error:furniturePose.current?undefined:'Дождитесь открытия 3D'});
   return;
  }
  if(data.type==='roomdesign:configure-cabinet-create'){
   if(furniturePose.current&&['dresser','tv_stand'].includes(data.kind)){
    window.dispatchEvent(new CustomEvent('roomdesign:configure-cabinet-create',{detail:{kind:data.kind,pose:furniturePose.current}}));
   }
   return;
  }
  if(data.type==='roomdesign:add-furniture'){
   try{
    const pose=furniturePose.current;
    if(!loaded.current||!pose)throw Error('Откройте каталог из нужного ракурса в 3D');
    const {plan,item}=resolveFurniturePlacement(data.item,pose);
    const dimensions=furnitureDimensions(item,item.height||defaults[item.kind]||900);
    const node=plannerFurnitureNode(plan,item,dimensions,templateAsset(item.kind));
    const schema=nodeRegistry.get('item')?.schema;
    if(!schema)throw Error('Редактор мебели ещё загружается');
    const model=await prepareFurnitureModel(node,item);
    if(!loaded.current||furniturePose.current!==pose)throw Error('Ракурс изменился. Откройте каталог повторно');
    const store=useScene.getState();
    if(!store.nodes[node.id as any])store.createNode(schema.parse(node) as any,node.parentId as any);
    send({type:'pascal:furniture-added',requestId:data.requestId,warning:model?.warning});
   }catch(error){
    send({type:'pascal:furniture-added',requestId:data.requestId,error:(error as Error).message});
   }
   return;
  }
  if(data.type==='roomdesign:floor-editing'){window.document.documentElement.dataset.floorEditing=String(data.active===true);return;}
  if(data.type==='roomdesign:capture'){window.dispatchEvent(new CustomEvent('roomdesign:capture-frame',{detail:{requestId:data.requestId}}));return;}
  if(data.type==='roomdesign:focus'){const canvas=window.document.querySelector('canvas');if(canvas){canvas.tabIndex=0;canvas.focus({preventScroll:true});}return;}
  if(data.type==='roomdesign:editor-command'){window.dispatchEvent(new CustomEvent('roomdesign:editor-command',{detail:{command:data.command}}));return;}
  if(data.type==='roomdesign:walk-key'){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(data.key))window.dispatchEvent(new CustomEvent('roomdesign:walk-key',{detail:{key:data.key,pressed:data.pressed===true}}));return;}
  if(data.type==='roomdesign:view'){setViewMode(data.mode==='eye'?'eye':'3d');if('wallWork'in data)setWallWork(data.wallWork||null);return;}
  if(data.type==='roomdesign:snapshot'){if(opening.current||!loaded.current){send({type:'pascal:snapshot',requestId:data.requestId,error:'Дождитесь открытия 3D'});return;}try{send({type:'pascal:snapshot',requestId:data.requestId,scene:sceneSnapshot(),baseline:baseline.current});}catch(e){send({type:'pascal:snapshot',requestId:data.requestId,error:(e as Error).message});}return;}
  if(data.type!=='roomdesign:open'||opening.current)return;opening.current=true;loaded.current=false;setError('');try{await bootstrap;cameraHandoff.current=null;const doc=data.document;sourcePlan.current=doc;furniturePose.current=null;setDecaroContext({projectId:data.projectId,sheetId:doc.id});setCabinetSpecificationScope(typeof data.projectId==='string'&&data.projectId?'project:'+data.projectId:'preview');setDocument(doc);setWallWorkspace(data.wallWorkspace===true);setWallWork(data.wallWork||null);setViewMode(data.mode==='eye'?'eye':'3d');const overrides=Object.fromEntries((doc.furniture||[]).map((f:any)=>[f.id,f.height||defaults[f.kind]||900]));
   const result=planningToPlanner(doc,{wallHeightMm:2800,doorHeightMm:2100,windowHeightMm:1400,windowSillMm:900,furnitureHeightsMm:overrides,assetFor:templateAsset});
   for(const node of Object.values(result.scene.nodes) as any[]) {
    if (node.type !== 'wall') continue;
    const saved = doc.walls.find((wall:any) => wall.id === node.metadata?.roomDesignId)?.plannerFinish;
    if (saved) {
     Object.assign(node.metadata, saved);
     for (const product of saved.roomDesignTileProducts || []) {
      try { registerTileProduct(product); } catch { /* Legacy catalog entries may be unavailable. */ }
     }
    }
   }
   // Keep 3D appearance, while every position and dimension comes from this 2D sheet.
   for(const node of Object.values(result.scene.nodes) as any[]){if(node.type!=='item'||node.metadata?.column)continue;const old=Object.values(data.previousScene?.nodes||{}).find((n:any)=>n.type==='item'&&n.metadata?.roomDesignId===node.metadata?.roomDesignId) as any;if((!old?.metadata?.modularCabinet||(old.metadata.modularCabinet.version===3&&old.metadata.cabinetGeometryVersion===CABINET_GEOMETRY_VERSION))&&(!node.metadata?.roomDesignFurniture?.modularCabinet||JSON.stringify(node.metadata.roomDesignFurniture.modularCabinet)===JSON.stringify(old?.metadata?.modularCabinet))&&old?.asset&&old.metadata?.roomDesignModelAsset&&old.metadata?.roomDesignFurniture?.catalog?.id===node.metadata?.roomDesignFurniture?.catalog?.id&&old.metadata?.catalogTextureId===doc.furniture?.find((f:any)=>f.id===node.metadata?.roomDesignId)?.model3D?.textureId){try{const url=await loadAssetUrl(old.metadata.roomDesignModelAsset);if(url){node.asset={...old.asset,src:url};node.scale=old.metadata.modularCabinet?old.scale:node.scale.map((n:number,i:number)=>n/node.asset.dimensions[i]);node.metadata={...old.metadata,...node.metadata,roomDesignModelAsset:old.metadata.roomDesignModelAsset};if(old.metadata.representation==='catalog-converted')newModelFocus.current=node.id;}}catch{}}
   }
   let supplierCatalogue:ReturnType<typeof cabinetCatalog>|undefined;
   for(const node of Object.values(result.scene.nodes) as any[]){
    if(node.type!=='item'||node.metadata?.column||node.metadata?.roomDesignModelAsset)continue;
    const f=doc.furniture?.find((f:any)=>f.id===node.metadata?.roomDesignId);
    if(f?.catalog?.id===CABINET_PRODUCT){
     try{
      const previous=Object.values(data.previousScene?.nodes||{}).find((old:any)=>old.metadata?.roomDesignId===node.metadata?.roomDesignId) as any;
      const configuration=normalizeCabinetConfig(f.modularCabinet||previous?.metadata?.modularCabinet||{modules:[newCabinet(f.cabinetModel||'5041')]});
      const assembled=await assembleCabinets(configuration,await (supplierCatalogue??=cabinetCatalog()));
      const dimensions=cabinetBounds(assembled).dimensions;
      const unit=new Group();unit.add(assembled);unit.scale.set(1/dimensions[0],1/dimensions[1],1/dimensions[2]);
      const bytes=await new GLTFExporter().parseAsync(unit,{binary:true});
      const assetRef=await saveAsset(new File([bytes as ArrayBuffer],'modular-cabinet.glb',{type:'model/gltf-binary'}));
      node.asset={...node.asset,id:'modular-'+f.id,src:await loadAssetUrl(assetRef)};
      node.scale=dimensions;
      node.metadata={...node.metadata,roomDesignModelAsset:assetRef,representation:'catalog-converted',catalogProductId:CABINET_PRODUCT,modularCabinet:configuration,cabinetGeometryVersion:CABINET_GEOMETRY_VERSION};
      newModelFocus.current=node.id;
     }catch(reason){result.warnings.push(f.name+' — '+(reason as Error).message);}
     continue;
    }
    const resultModel=await prepareFurnitureModel(node,f);
    if(resultModel?.warning)result.warnings.push(resultModel.warning);
    if(resultModel?.ready)newModelFocus.current=node.id;
   }
   for(const [id,node] of Object.entries(result.scene.nodes)){const schema=nodeRegistry.get((node as any).type)?.schema;if(!schema)throw Error('Неизвестный тип 3D-объекта');result.scene.nodes[id]=schema.parse(node);}
   baseline.current=structuredClone(result.scene);setWarnings(result.warnings);setScene(result.scene);setKey(k=>k+1);lastChange.current='';send({type:'pascal:scene-prepared'});
  }catch(e:any){setError(e.message);send({type:'pascal:error',error:e.message});}finally{opening.current=false;}
 };window.addEventListener('message',receive);send({type:'pascal:ready'});return()=>window.removeEventListener('message',receive);},[]);
 useEffect(()=>{const select=(e:any)=>send({type:'pascal:floor-select',id:e.detail?.id}),error=(e:any)=>send({type:'pascal:floor-error',error:e.detail});window.addEventListener('roomdesign:floor-select',select);window.addEventListener('roomdesign:floor-error',error);const wallNavigate=(e:any)=>send({type:'roomdesign:wall-work-navigate',direction:e.detail});window.addEventListener('roomdesign:wall-work-navigate',wallNavigate);const catalog=(e:any)=>send({type:'pascal:wall-tile-catalog',target:e.detail});window.addEventListener('roomdesign:wall-tile-catalog-request',catalog);const done=(e:any)=>send({type:'pascal:camera',...e.detail});window.addEventListener('roomdesign:camera-captured',done);return()=>{window.removeEventListener('roomdesign:wall-work-navigate',wallNavigate);window.removeEventListener('roomdesign:wall-tile-catalog-request',catalog);window.removeEventListener('roomdesign:camera-captured',done);window.removeEventListener('roomdesign:floor-select',select);window.removeEventListener('roomdesign:floor-error',error);};},[]);
 const onLoad=useCallback(async()=>structuredClone(scene),[scene]);
 const onSave=useCallback(async(next:any)=>{if(!loaded.current)return;const text=JSON.stringify(next.nodes);if(text===lastChange.current)return;lastChange.current=text;send({type:'pascal:changed',scene:snapshotScene(next,tileProducts),baseline:baseline.current});},[]);
 const ready=useCallback((show:boolean)=>{if(show||!scene)return;useEditor.getState().setViewLayout(sceneLayout('3d'));loaded.current=true;lastChange.current=JSON.stringify(useScene.getState().nodes);send({type:'pascal:loaded'});if(newModelFocus.current){const n:any=useScene.getState().nodes[newModelFocus.current];newModelFocus.current=null;if(n){const [x,y,z]=n.position,[w,h,d]=n.scale;emitter.emit('camera-controls:frame',{bounds:{min:[x-w/2,y,z-d/2],max:[x+w/2,y+h,z+d/2]},pose:{position:[x+1.8,y+1.3,z+1.8],target:[x,y+h/2,z]}});return;}}const walls=Object.values(scene.nodes).filter((n:any)=>n.type==='wall') as any[],points=walls.flatMap(w=>[w.start,w.end]);if(points.length){const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2,r=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs),4);emitter.emit('camera-controls:frame',{bounds:{min:[Math.min(...xs),0,Math.min(...zs)],max:[Math.max(...xs),3,Math.max(...zs)]},pose:{position:[x+r,r*1.25,z+r],target:[x,.5,z]}});}},[scene]);
 const demo=params.get('cabinets')==='1';
 function openCabinet(){
  const node=Object.values(useScene.getState().nodes).find((node:any)=>node.metadata?.catalogProductId===CABINET_PRODUCT) as any;
  if(node)window.dispatchEvent(new CustomEvent('roomdesign:configure-cabinet',{detail:{id:node.id}}));
 }
 return <div className={`linked-room-planner ${viewMode==='eye'?'is-walkthrough':''} ${wallWork?'rd-wall-work-mode':''} ${wallWorkspace?'rd-wall-docked':''}`}>{demo&&scene&&<div className="rd-cabinet-preview-tools"><button type="button" onClick={openCabinet}>Настроить комоды</button></div>}{warnings.length>0&&<details className="linked-room-planner-assumptions"><summary>Особенности 3D · {warnings.length}</summary>{warnings.map((w,i)=><p key={i}>{w}</p>)}<p>Исходные размеры в 2D сохраняются. Временное значение станет размером плана только при его изменении в 3D.</p></details>}{error&&<p role="alert">{error}</p>}{scene?<><FurnitureSurfaceMenu specificationScope={cabinetSpecificationScope} resolvePlacement={resolveFurniturePlacement} requestCatalog={requestCatalogModel} onOpenChange={textureEditorChanged}/><EditorShortcuts/>{!wallWork&&<DragControls keyboard={viewMode==='3d'}/>}{viewMode==='eye'&&<WalkHud/>}<WallRegionIndicator/><WallFinishPanel docked={wallWorkspace} active={viewMode==='eye'||!!wallWork}/><MouldingPaintBadge active={viewMode==='eye'||!!wallWork}/><div className="rd-editor-viewport"><Editor disablePostFx={!!wallWork} viewerSceneSlot={<><FurnitureViewCamera readPose={readFurniturePose} mode={viewMode}/><CameraCapture/><FloorSurfaces/>{viewMode==='3d'&&!wallWork&&<WallProximity/>}<WallFinishScene active={viewMode==='eye'||!!wallWork} plan={document}/>{wallWork&&<WallWorkCamera context={wallWork} handoff={cameraHandoff}/>}<WalkCamera active={viewMode==='eye'&&!wallWork} plan={document} onError={setError} onPose={wallWorkspace?sendWalkPose:undefined} handoff={wallWorkspace?cameraHandoff:undefined}/></>} key={key} viewBar={false} layoutVersion="v2" projectId={'linked:'+session} onLoad={onLoad} onSave={onSave} onLoaderChange={ready} actionMenuPlacement="top"/></div></>:!error&&<p className="linked-room-planner-wait">Подготавливаем текущий лист…</p>}</div>;
}
const cabinetKind=params.get('cabinet');
createRoot(document.getElementById('root')!,{
 onUncaughtError(error){
  console.error('Room Design 3D runtime error',error);
  send({type:'pascal:error',error:'Не удалось отобразить сцену в 3D.'});
 },
}).render(cabinetKind==='dresser'||cabinetKind==='tv_stand'?<StandaloneCabinetConfigurator kind={cabinetKind}/>:<App/>);
