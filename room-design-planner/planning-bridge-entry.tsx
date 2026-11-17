import {CABINET_PRODUCT,cabinetCatalog,assembleCabinets,newCabinet,cabinetBounds,normalizeCabinetConfig} from './modular-cabinets';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {Group} from 'three';
import {registerTileProduct,tileProducts} from './tile-products.mjs';
const catalogModelJobs=new Map<string,{resolve:(x:any)=>void;reject:(e:Error)=>void;timer:any}>();
import {FurnitureSurfaceMenu} from './furniture-surface-editor.tsx';
import {WallRegionIndicator} from './wall-region-indicator.tsx';
import {FloorSurfaces} from './floor-surfaces.tsx';
import {CameraCapture} from './camera-capture.tsx';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Editor,sceneLayout,useEditor} from '@pascal-app/editor';
import {builtinPlugin} from '@pascal-app/nodes';
import {loadPlugin,useScene,loadAssetUrl,saveAsset,nodeRegistry,emitter} from '@pascal-app/core';
import {planningToPlanner} from '../lib/planning-plan/planner-adapter';
import {EditorShortcuts} from './editor-shortcuts.tsx';
import {WalkCamera,WalkHud} from './walkthrough.tsx';
import {MouldingPaintBadge} from './orac-mouldings.tsx';
import {WallFinishScene,WallFinishPanel} from './wall-finishes.tsx';
import {WallProximity} from './wall-proximity.tsx';
import {DragControls} from './drag-controls';
import './style.css';
import './planning-bridge.css';
const bootstrap=loadPlugin(builtinPlugin),params=new URLSearchParams(location.search),session=params.get('session'),parentOrigin=params.get('parentOrigin')||'';
const allowed=new Set([location.origin]);
const send=(data:any)=>{if(allowed.has(parentOrigin))window.parent.postMessage({...data,session},parentOrigin);};
function sceneSnapshot() {
 const state = useScene.getState();
 const scene = structuredClone({nodes:state.nodes,rootNodeIds:state.rootNodeIds});
 for (const node of Object.values(scene.nodes) as any[]) {
  if (node.type !== 'wall') continue;
  const metadata = node.metadata || {};
  const ids = new Set([...(metadata.roomDesignTiles || []), ...(metadata.roomDesignTileRegions || []), metadata.roomDesignTileSettings].filter(Boolean).map(piece => piece.productId));
  const products = tileProducts.filter(product => ids.has(product.id));
  if (products.length) metadata.roomDesignTileProducts = products;
  else delete metadata.roomDesignTileProducts;
 }
 return scene;
}
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
function App(){const [viewMode,setViewMode]=useState<'3d'|'eye'>('3d'),[document,setDocument]=useState<any>(null);const [scene,setScene]=useState<any>(null),[error,setError]=useState(''),[warnings,setWarnings]=useState<string[]>([]),[key,setKey]=useState(0),baseline=useRef<any>(null),newModelFocus=useRef<string|null>(null),opening=useRef(false),loaded=useRef(false),lastChange=useRef('');
 useEffect(()=>{useEditor.getState().setViewLayout(sceneLayout('3d'));},[]);
 useEffect(()=>{const receive=async(event:MessageEvent)=>{if(event.source!==window.parent||event.origin!==parentOrigin||event.data?.session!==session||!allowed.has(parentOrigin))return;const data=event.data;if(data.type==='roomdesign:model-prepared'){const job=catalogModelJobs.get(data.requestId);if(job){clearTimeout(job.timer);catalogModelJobs.delete(data.requestId);if(data.error)job.reject(Error(data.error));else job.resolve(data.result);}return;}
  if(data.type==='roomdesign:wall-tile-product'){window.dispatchEvent(new CustomEvent('roomdesign:wall-tile-product',{detail:data.product}));return;}
  if(data.type==='roomdesign:floor-update'){const store=useScene.getState(),slab:any=store.nodes['slab_roomdesign'];if(slab)store.updateNode(slab.id,{metadata:{...slab.metadata,roomDesignFloorRegions:data.regions,roomDesignFloorGeometry:data.geometry}} as any);return;}
  if(data.type==='roomdesign:floor-editing'){window.document.documentElement.dataset.floorEditing=String(data.active===true);return;}
  if(data.type==='roomdesign:capture'){window.dispatchEvent(new CustomEvent('roomdesign:capture-frame',{detail:{requestId:data.requestId}}));return;}
  if(data.type==='roomdesign:focus'){const canvas=window.document.querySelector('canvas');if(canvas){canvas.tabIndex=0;canvas.focus({preventScroll:true});}return;}
  if(data.type==='roomdesign:editor-command'){window.dispatchEvent(new CustomEvent('roomdesign:editor-command',{detail:{command:data.command}}));return;}
  if(data.type==='roomdesign:walk-key'){if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(data.key))window.dispatchEvent(new CustomEvent('roomdesign:walk-key',{detail:{key:data.key,pressed:data.pressed===true}}));return;}
  if(data.type==='roomdesign:view'){setViewMode(data.mode==='eye'?'eye':'3d');return;}
  if(data.type==='roomdesign:snapshot'){if(opening.current||!loaded.current){send({type:'pascal:snapshot',requestId:data.requestId,error:'Дождитесь открытия 3D'});return;}send({type:'pascal:snapshot',requestId:data.requestId,scene:sceneSnapshot(),baseline:baseline.current});return;}
  if(data.type!=='roomdesign:open'||opening.current)return;opening.current=true;loaded.current=false;setError('');try{await bootstrap;const doc=data.document;setDocument(doc);setViewMode(data.mode==='eye'?'eye':'3d');const overrides=Object.fromEntries((doc.furniture||[]).map((f:any)=>[f.id,f.height||defaults[f.kind]||900]));
   const result=planningToPlanner(doc,{wallHeightMm:2800,doorHeightMm:2100,windowHeightMm:1400,windowSillMm:900,furnitureHeightsMm:overrides,assetFor:(kind:string)=>new URL(`${import.meta.env.BASE_URL}models/${kind}.glb`, location.origin).href});
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
   for(const node of Object.values(result.scene.nodes) as any[]){if(node.type!=='item'||node.metadata?.column)continue;const old=Object.values(data.previousScene?.nodes||{}).find((n:any)=>n.type==='item'&&n.metadata?.roomDesignId===node.metadata?.roomDesignId) as any;if((!old?.metadata?.modularCabinet||old.metadata.modularCabinet.version===3)&&old?.asset&&old.metadata?.roomDesignModelAsset&&old.metadata?.roomDesignFurniture?.catalog?.id===node.metadata?.roomDesignFurniture?.catalog?.id&&old.metadata?.catalogTextureId===doc.furniture?.find((f:any)=>f.id===node.metadata?.roomDesignId)?.model3D?.textureId){try{const url=await loadAssetUrl(old.metadata.roomDesignModelAsset);if(url){node.asset={...old.asset,src:url};node.scale=old.metadata.modularCabinet?old.scale:node.scale.map((n:number,i:number)=>n/node.asset.dimensions[i]);node.metadata={...old.metadata,...node.metadata,roomDesignModelAsset:old.metadata.roomDesignModelAsset};if(old.metadata.representation==='catalog-converted')newModelFocus.current=node.id;}}catch{}}
   }
   for(const node of Object.values(result.scene.nodes) as any[]){
    if(node.type!=='item'||node.metadata?.column||node.metadata?.roomDesignModelAsset)continue;
    const f=doc.furniture?.find((f:any)=>f.id===node.metadata?.roomDesignId),binding=f?.model3D;
    if(f?.catalog?.id===CABINET_PRODUCT){
     const previous=Object.values(data.previousScene?.nodes||{}).find((old:any)=>old.metadata?.roomDesignId===node.metadata?.roomDesignId) as any;
     const configuration=normalizeCabinetConfig(previous?.metadata?.modularCabinet||{modules:[newCabinet(f.cabinetModel||'5041')]});
     const assembled=await assembleCabinets(configuration,await cabinetCatalog());
     const dimensions=cabinetBounds(assembled).dimensions;
     const unit=new Group();unit.add(assembled);unit.scale.set(1/dimensions[0],1/dimensions[1],1/dimensions[2]);
     const bytes=await new GLTFExporter().parseAsync(unit,{binary:true});
     const assetRef=await saveAsset(new File([bytes as ArrayBuffer],'modular-cabinet.glb',{type:'model/gltf-binary'}));
     node.asset={...node.asset,id:'modular-'+f.id,src:await loadAssetUrl(assetRef)};
     node.scale=dimensions;
     node.metadata={...node.metadata,roomDesignModelAsset:assetRef,representation:'catalog-converted',catalogProductId:CABINET_PRODUCT,modularCabinet:configuration};
     newModelFocus.current=node.id;
     continue;
    }
    if(!binding)continue;
    if (!binding.url) {
      result.warnings.push(`${f.name}: ссылка на 3D-модель ещё недоступна; показано условное обозначение`);
      continue;
    }
    try {
      const prepared = await requestCatalogModel(binding.productId, {textureId:binding.textureId});
      if (prepared.warning) result.warnings.push(`${f.name}: ${prepared.warning}`);
      const modelURL = new URL(prepared.url, location.origin);
      if (modelURL.origin !== location.origin || modelURL.pathname !== '/api/catalog/model-asset') throw Error('Недопустимый адрес модели');
      const response = await fetch(modelURL, {signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw Error('Файл недоступен');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 12 || bytes.byteLength > 50*1024*1024 || new DataView(bytes).getUint32(0,true)!==0x46546c67) throw Error('Некорректный GLB');
     const ref=await saveAsset(new File([bytes],binding.productId+'.glb',{type:'model/gltf-binary'}));node.asset={...node.asset,id:'catalog-'+binding.productId,src:await loadAssetUrl(ref)};node.metadata={...node.metadata,roomDesignModelAsset:ref,representation:'catalog-converted',catalogProductId:binding.productId,...(binding.textureId?{catalogTextureId:binding.textureId}:{})};newModelFocus.current=node.id;
    }catch(error){result.warnings.push(`${f.name}: ${error instanceof Error ? error.message : 'модель не загрузилась'}; 2D-привязка сохранена, показано условное обозначение`);}
   }
   for(const [id,node] of Object.entries(result.scene.nodes)){const schema=nodeRegistry.get((node as any).type)?.schema;if(!schema)throw Error('Неизвестный тип 3D-объекта');result.scene.nodes[id]=schema.parse(node);}
   baseline.current=structuredClone(result.scene);setWarnings(result.warnings);setScene(result.scene);setKey(k=>k+1);lastChange.current='';
  }catch(e:any){setError(e.message);send({type:'pascal:error',error:e.message});}finally{opening.current=false;}
 };window.addEventListener('message',receive);send({type:'pascal:ready'});return()=>window.removeEventListener('message',receive);},[]);
 useEffect(()=>{const select=(e:any)=>send({type:'pascal:floor-select',id:e.detail?.id}),error=(e:any)=>send({type:'pascal:floor-error',error:e.detail});window.addEventListener('roomdesign:floor-select',select);window.addEventListener('roomdesign:floor-error',error);const catalog=()=>send({type:'pascal:wall-tile-catalog'});window.addEventListener('roomdesign:wall-tile-catalog-request',catalog);const done=(e:any)=>send({type:'pascal:camera',...e.detail});window.addEventListener('roomdesign:camera-captured',done);return()=>{window.removeEventListener('roomdesign:wall-tile-catalog-request',catalog);window.removeEventListener('roomdesign:camera-captured',done);window.removeEventListener('roomdesign:floor-select',select);window.removeEventListener('roomdesign:floor-error',error);};},[]);
 const onLoad=useCallback(async()=>structuredClone(scene),[scene]);
 const onSave=useCallback(async(next:any)=>{if(!loaded.current)return;const text=JSON.stringify(next.nodes);if(text===lastChange.current)return;lastChange.current=text;send({type:'pascal:changed',scene:next,baseline:baseline.current});},[]);
 const ready=useCallback((show:boolean)=>{if(show||!scene)return;useEditor.getState().setViewLayout(sceneLayout('3d'));loaded.current=true;lastChange.current=JSON.stringify(useScene.getState().nodes);send({type:'pascal:loaded'});if(newModelFocus.current){const n:any=useScene.getState().nodes[newModelFocus.current];newModelFocus.current=null;if(n){const [x,y,z]=n.position,[w,h,d]=n.scale;emitter.emit('camera-controls:frame',{bounds:{min:[x-w/2,y,z-d/2],max:[x+w/2,y+h,z+d/2]},pose:{position:[x+1.8,y+1.3,z+1.8],target:[x,y+h/2,z]}});return;}}const walls=Object.values(scene.nodes).filter((n:any)=>n.type==='wall') as any[],points=walls.flatMap(w=>[w.start,w.end]);if(points.length){const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2,r=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs),4);emitter.emit('camera-controls:frame',{bounds:{min:[Math.min(...xs),0,Math.min(...zs)],max:[Math.max(...xs),3,Math.max(...zs)]},pose:{position:[x+r,r*1.25,z+r],target:[x,.5,z]}});}},[scene]);
 const demo=params.get('cabinets')==='1';
 function openCabinet(){
  const node=Object.values(useScene.getState().nodes).find((node:any)=>node.metadata?.catalogProductId===CABINET_PRODUCT) as any;
  if(node)window.dispatchEvent(new CustomEvent('roomdesign:configure-cabinet',{detail:{id:node.id}}));
 }
 return <div className={`linked-room-planner ${viewMode==='eye'?'is-walkthrough':''}`}>{demo&&scene&&<div className="rd-cabinet-preview-tools"><button type="button" onClick={openCabinet}>Настроить комоды</button></div>}{warnings.length>0&&<details className="linked-room-planner-assumptions"><summary>Особенности 3D · {warnings.length}</summary>{warnings.map((w,i)=><p key={i}>{w}</p>)}<p>Исходные размеры в 2D сохраняются. Временное значение станет размером плана только при его изменении в 3D.</p></details>}{error&&<p role="alert">{error}</p>}{scene?<><FurnitureSurfaceMenu requestCatalog={requestCatalogModel} onOpenChange={textureEditorChanged}/><EditorShortcuts/><DragControls keyboard={viewMode==='3d'}/>{viewMode==='eye'&&<WalkHud/>}<WallRegionIndicator/><WallFinishPanel active={viewMode==='eye'}/><MouldingPaintBadge active={viewMode==='eye'}/><Editor viewerSceneSlot={<><CameraCapture/><FloorSurfaces/>{viewMode==='3d'&&<WallProximity/>}<WallFinishScene active={viewMode==='eye'}/><WalkCamera active={viewMode==='eye'} plan={document} onError={setError}/></>} key={key} viewBar={false} layoutVersion="v2" projectId={'linked:'+session} onLoad={onLoad} onSave={onSave} onLoaderChange={ready} actionMenuPlacement="top"/></>:!error&&<p className="linked-room-planner-wait">Подготавливаем текущий лист…</p>}</div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
