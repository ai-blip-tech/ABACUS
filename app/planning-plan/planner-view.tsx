'use client';
import {forwardRef,useCallback,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {floorRegionGeometry} from '@/lib/measured-plan/measure-floor-finishes';
import {editorKeyCommand} from '@/lib/planning-plan/key-command';
import type {MeasureDoc} from '@/lib/measured-plan/measure-model';
import type {WallWalkPose,wallWorkContext} from '@/lib/wall-decoration/surfaces';
import type {PlannerScene} from '@/lib/planning-plan/planner-sync';
export type PlannerSnapshot={scene:PlannerScene;baseline:PlannerScene};
export type PlannerViewControl={clearSelection:()=>void;configureCabinet:(kind:"dresser"|"tv_stand")=>void;wallTile:(product:any)=>void;wallZoom:(action:'in'|'out'|'fit')=>void;floor:(plan:MeasureDoc)=>void;floorEditing:(active:boolean)=>void;focus:()=>void;snapshot:()=>Promise<PlannerSnapshot>;capture:()=>Promise<any>};
export const plannerEntry = '/room-design-planner/view';
export const PlannerView=forwardRef<PlannerViewControl,{plan:MeasureDoc;projectId:string;projectName:string;disabled?:boolean;mode:'3d'|'eye';floorEditing?:boolean;wallWork?:ReturnType<typeof wallWorkContext>|null;onWallNavigate?:(direction:number)=>void;onWalkPose?:(pose:WallWalkPose)=>void;onWallTileCatalog?:(target?:{tileId:string;widthMm:number;heightMm:number})=>void;onFloorSelect?:(id:string)=>void;onFloorSync?:(regions:NonNullable<MeasureDoc["floorRegions"]>)=>void;onDirty:()=>void}>(({plan,projectId,projectName,onDirty,disabled,mode,onFloorSelect,floorEditing,onFloorSync,onWallTileCatalog,wallWork,onWallNavigate,onWalkPose},control)=>{
 const frame=useRef<HTMLIFrameElement>(null),[session,setSession]=useState(()=>crypto.randomUUID()),[ready,setReady]=useState(false),[editingTextures,setEditingTextures]=useState(false),[error,setError]=useState(''),pending=useRef(new Map<string,{resolve:(s:PlannerSnapshot)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>());
 const origin = plannerEntry?.startsWith('http:') ? new URL(plannerEntry).origin : typeof window !== 'undefined' ? window.location.origin : '';
 const [frameSession,setFrameSession]=useState('');
 const [phase,setPhase]=useState<'module'|'scene'|'viewer'>('module');
 const [startupError,setStartupError]=useState('');
 const [retrying,setRetrying]=useState(false);
 const automaticRetryUsed=useRef(false);
 const failedSession=useRef('');
 const wallWorkspace=wallWork!==undefined;

 const restart=useCallback(()=>{
  setReady(false);
  setEditingTextures(false);
  setError('');
  setStartupError('');
  setPhase('module');
  setSession(crypto.randomUUID());
 },[]);

 const failStartup=useCallback((message:string,retryModule=false)=>{
  if(failedSession.current===session)return;
  failedSession.current=session;
  if(retryModule&&!automaticRetryUsed.current){
   automaticRetryUsed.current=true;
   setRetrying(true);
   restart();
  }else setStartupError(message);
 },[session,restart]);

 function retry(){
  automaticRetryUsed.current=false;
  setRetrying(false);
  restart();
 }

 const pendingCabinet=useRef<'dresser'|'tv_stand'|null>(null);
 // Rebinding a callback is not an editor close: keep in-flight save snapshots alive.
 useEffect(()=>()=>{for(const job of pending.current.values()){clearTimeout(job.timer);job.reject(Error('3D-редактор закрыт'));}pending.current.clear();},[session,origin]);
 const cacheKey='roomdesign-pascal-linked:'+projectId+':'+plan.id;
 useEffect(()=>{const receive=(event:MessageEvent)=>{if(event.origin!==origin||event.source!==frame.current?.contentWindow||event.data?.session!==session)return;const data=event.data;
  if(data.type==='pascal:ready'){setPhase('scene');let previousScene;try{previousScene=JSON.parse(localStorage.getItem(cacheKey)||'null')?.scene;}catch{}frame.current?.contentWindow?.postMessage({type:'roomdesign:open',session,document:plan,projectId,projectName,previousScene,mode,wallWork,wallWorkspace:wallWork!==undefined},origin);}
  if(data.type==='pascal:model-prepare'){void (async()=>{try{const r=await fetch('/api/catalog/model-asset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:data.productId,textureId:data.textureId,inspect:data.surfaceEditing===true,surfaceEditing:data.surfaceEditing===true})}),result=await r.json();if(!r.ok)throw Error(result.error||'Не удалось подготовить модель');frame.current?.contentWindow?.postMessage({type:'roomdesign:model-prepared',session,requestId:data.requestId,result:{...result,...(result.url?{url:location.origin+result.url}:{})}},origin);}catch(e){frame.current?.contentWindow?.postMessage({type:'roomdesign:model-prepared',session,requestId:data.requestId,error:(e as Error).message},origin);}})();}
  if(data.type==='pascal:furniture-textures-open')setEditingTextures(data.active===true);
  if(data.type==='roomdesign:wall-work-navigate')onWallNavigate?.(data.direction);
  if(data.type==='pascal:wall-walk-pose'&&mode==='eye'&&onWalkPose){
   const pose=data.pose as WallWalkPose|undefined;
   if(pose&&Array.isArray(pose.position)&&pose.position.length===2&&Array.isArray(pose.direction)&&pose.direction.length===2&&
      [...pose.position,...pose.direction,pose.height,pose.slope].every(Number.isFinite))onWalkPose(pose);
  }
  if(data.type==='pascal:wall-tile-catalog')onWallTileCatalog?.(data.target);
  if(data.type==='pascal:floor-select')onFloorSelect?.(data.id);
  if(data.type==='pascal:floor-error')setError(data.error);
  if(data.type==='pascal:scene-prepared')setPhase('viewer');
  if(data.type==='pascal:module-error')failStartup('Не удалось загрузить 3D-редактор.',true);
  if(data.type==='pascal:loaded'){setReady(true);setStartupError('');setRetrying(false);if(pendingCabinet.current){frame.current?.contentWindow?.postMessage({type:'roomdesign:configure-cabinet-create',session,kind:pendingCabinet.current},origin);pendingCabinet.current=null;}}
  if(data.type==='pascal:changed'){onDirty();const regions=data.scene?.nodes?.slab_roomdesign?.metadata?.roomDesignFloorRegions;if(Array.isArray(regions))onFloorSync?.(regions);try{localStorage.setItem(cacheKey,JSON.stringify({scene:data.scene,baseline:data.baseline}));}catch{setError('Не удалось сохранить локальные 3D-модели. Не закрывайте вкладку.');}}
  if(data.type==='pascal:camera'){const p=pending.current.get(data.requestId);if(!p)return;clearTimeout(p.timer);pending.current.delete(data.requestId);if(data.error)p.reject(Error(data.error));else p.resolve(data);}
  if(data.type==='pascal:snapshot'){const p=pending.current.get(data.requestId);if(!p)return;clearTimeout(p.timer);pending.current.delete(data.requestId);if(data.error)p.reject(Error(data.error));else{try{localStorage.setItem(cacheKey,JSON.stringify({scene:data.scene,baseline:data.baseline}));}catch{}p.resolve({scene:data.scene,baseline:data.baseline});}}
  if(data.type==='pascal:error'){
   const message=data.error||'Не удалось открыть 3D.';
   if(ready)setError(message);
   else failStartup(message);
  }
 };window.addEventListener('message',receive);return()=>{window.removeEventListener('message',receive);};},[session,plan,projectId,projectName,cacheKey,onDirty,mode,onFloorSelect,onFloorSync,onWallTileCatalog,onWallNavigate,onWalkPose,wallWork,origin,ready,failStartup]);
 // Mount after registering the listener so a cached module cannot send ready too early.
 useEffect(()=>{setFrameSession(session);},[session]);
 useEffect(()=>{
  if(ready||startupError)return;
  // The compressed editor bundle alone needs over 20 seconds at 1 Mbit/s.
  const timeLimit=phase==='module'?60000:phase==='scene'&&!wallWorkspace?120000:30000;
  const message=phase==='module'?'Не удалось загрузить 3D-редактор.':phase==='scene'?'Подготовка сцены заняла слишком много времени.':'3D-редактор не показал сцену вовремя.';
  const timer=window.setTimeout(()=>failStartup(message,phase==='module'),timeLimit);
  return()=>window.clearTimeout(timer);
 },[phase,ready,session,startupError,wallWorkspace,failStartup]);
 useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({type:'roomdesign:floor-editing',session,active:floorEditing===true},origin);},[ready,floorEditing,session,origin]);
 useEffect(()=>{if(ready)frame.current?.contentWindow?.postMessage({type:'roomdesign:view',session,mode,wallWork:wallWork||null},origin);},[ready,mode,wallWork,session,origin]);
 useEffect(()=>{if(!ready||disabled)return;const key=(event:KeyboardEvent)=>{if(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"],dialog,[role="dialog"]'))return;const command=editorKeyCommand(event);if(!command)return;event.preventDefault();event.stopImmediatePropagation();frame.current?.contentWindow?.postMessage({type:'roomdesign:editor-command',session,command},origin);};window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);},[ready,disabled,session,origin]);
 // The host mode switch can keep keyboard focus outside the embedded canvas.
 useEffect(()=>{if(mode!=='eye'||!ready)return;const held=new Set<string>(),arrows=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);
  const send=(key:string,pressed:boolean)=>frame.current?.contentWindow?.postMessage({type:'roomdesign:walk-key',session,key,pressed},origin);
  const down=(event:KeyboardEvent)=>{const key=event.code||event.key;if(!arrows.has(key)||event.ctrlKey||event.metaKey||event.altKey||(event.target instanceof Element&&event.target.closest('input,textarea,select,[contenteditable="true"]')))return;event.preventDefault();event.stopImmediatePropagation();held.add(key);send(key,true);};
  const up=(event:KeyboardEvent)=>{const key=event.code||event.key;if(arrows.has(key)){held.delete(key);send(key,false);}};
  const clear=()=>{for(const key of held)send(key,false);held.clear();};window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);window.addEventListener('blur',clear);return()=>{clear();window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);window.removeEventListener('blur',clear);};
 },[mode,ready,session,origin]);
 useImperativeHandle(control,()=>({clearSelection:()=>frame.current?.contentWindow?.postMessage({type:'roomdesign:editor-command',session,command:'clear'},origin),configureCabinet:kind=>{if(!ready){pendingCabinet.current=kind;return;}frame.current?.contentWindow?.postMessage({type:"roomdesign:configure-cabinet-create",session,kind},origin);},wallZoom:action=>frame.current?.contentWindow?.postMessage({type:'roomdesign:wall-zoom',session,action},origin),wallTile:product=>frame.current?.contentWindow?.postMessage({type:'roomdesign:wall-tile-product',session,product},origin),floor:(doc)=>{frame.current?.contentWindow?.postMessage({type:'roomdesign:floor-update',session,regions:doc.floorRegions||[],geometry:(doc.floorRegions||[]).map(r=>({id:r.id,...floorRegionGeometry(doc,r)}))},origin);},floorEditing:active=>frame.current?.contentWindow?.postMessage({type:'roomdesign:floor-editing',session,active},origin),capture:()=>new Promise((resolve,reject)=>{if(!ready){reject(Error('Подождите загрузки камеры'));return;}const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.current.delete(requestId);reject(Error('Не удалось получить снимок'));},15000);pending.current.set(requestId,{resolve,reject,timer});frame.current?.contentWindow?.postMessage({type:'roomdesign:capture',session,requestId},origin);}),focus:()=>{frame.current?.focus();frame.current?.contentWindow?.postMessage({type:'roomdesign:focus',session},origin);},snapshot:()=>new Promise((resolve,reject)=>{if(!ready){reject(Error('Подождите загрузки 3D'));return;}const requestId=crypto.randomUUID(),timer=setTimeout(()=>{pending.current.delete(requestId);reject(Error('Room Design Planner не ответил. Правки остаются в открытом 3D-редакторе.'));},15000);pending.current.set(requestId,{resolve,reject,timer});frame.current?.contentWindow?.postMessage({type:'roomdesign:snapshot',session,requestId},origin);})}),[ready,session,origin]);
 const parentOrigin=typeof window==='undefined'?'':window.location.origin;
 const loadingText=phase==='module'
  ?(retrying?'Повторно загружаем 3D-редактор…':'Загружаем 3D-редактор…')
  :phase==='scene'?'Подготавливаем текущий лист…':'Открываем текущий лист в 3D…';
 return <section className="planning-room-planner-stage" data-texture-editor={editingTextures?'open':undefined} aria-label="Планировочное решение в Room Design Planner 3D">
  {!ready&&<div className="planning-room-planner-loading">
   {startupError?<div className="planning-3d-retry"><p role="alert">{startupError}</p><button type="button" onClick={retry}>Повторить загрузку 3D</button></div>:<span role="status">{loadingText}</span>}
  </div>}
  {error&&<p className="planning-bridge-error" role="alert">{error}</p>}
  {frameSession===session&&<iframe key={session} inert={disabled||!ready} ref={frame} title="Room Design Planner · 3D планировочного решения" src={`${plannerEntry}?session=${encodeURIComponent(session)}&parentOrigin=${encodeURIComponent(parentOrigin)}`} allow="fullscreen"/>}
 </section>;
});
PlannerView.displayName='PlannerView';
