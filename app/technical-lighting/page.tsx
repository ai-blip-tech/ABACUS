"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import "./technical-lighting-folio.css";
import "./technical-lighting-responsive.css";
import "./technical-lighting-project.css";

type Point={x:number;y:number};
type Product={id:string;article:string;name:string;image:string;price:number;available:boolean;categoryTrail:string;type:"track"|"track_fixture"|"fixture"|"power"|"accessory";isReference?:boolean;specs:{powerW:number|null;voltageV:number|null;cctK:number|null;beamDeg:number|null;widthMm?:number|null;lengthMm:number|null}};
type Track={id:string;points:[Point,Point];product:Product;lengthMm:number;rotation:number};
type Fixture={id:string;point:Point;product:Product;trackId?:string};
type Selection={kind:"track"|"fixture";id:string}|null;
type Drag={kind:"track"|"fixture";id:string;last:Point}|null;
type History={id:string;image:string;label:string;products:Product[]};
type EditAction="add"|"replace"|"remove"|null;
type BrandOption={id:string;name:string};
type PlanClipboard={kind:"track";track:Track}|{kind:"fixture";fixture:Fixture}|null;
type RotateTrackDrag={id:string;centerX:number;centerY:number;startAngle:number;startRotation:number}|null;
type RoomResizeDrag={side:"left"|"right"|"top"|"bottom";x:number;y:number;width:number;length:number;pixelWidth:number;pixelHeight:number}|null;
type ProjectOption={id:string;name:string;project_type?:string;updated_at?:string};

const DEFAULT_PLAN_PROMPT="Создать фотореалистичную визуализацию потолка и верхней части современного жилого интерьера. Потолок и вся система технического света — главный объект кадра и занимают не менее двух третей изображения. Точно, без пропусков и замен воспроизвести каждый трек и каждый пронумерованный светильник с планограммы: их количество, тип монтажа, модель, цвет и материал должны соответствовать выбранным товарам и референсам. Не добавлять незаданные светильники.";
const label=(type:Product["type"])=>({track:"Треки",track_fixture:"Трековые светильники",fixture:"Светильники",power:"Питание",accessory:"Комплектующие"})[type];
const money=(value:number)=>value?`${new Intl.NumberFormat("ru-RU").format(value)} ₽`:"Цена по запросу";
const lengthLabel=(value:number)=>value>=1000&&value%1000===0?`${value/1000} м`:`${value} мм`;
const center=(track:Track)=>({x:(track.points[0].x+track.points[1].x)/2,y:(track.points[0].y+track.points[1].y)/2});
const rotationHandle=(track:Track)=>{const dx=track.points[1].x-track.points[0].x,dy=track.points[1].y-track.points[0].y,length=Math.max(Math.hypot(dx,dy),.001);return{x:Math.max(2,Math.min(98,track.points[1].x+dx/length*4)),y:Math.max(2,Math.min(98,track.points[1].y+dy/length*4))}};
const at=(track:Track,t:number)=>({x:track.points[0].x+(track.points[1].x-track.points[0].x)*t,y:track.points[0].y+(track.points[1].y-track.points[0].y)*t});
const fractionAt=(track:Track,point:Point)=>{const dx=track.points[1].x-track.points[0].x,dy=track.points[1].y-track.points[0].y;return Math.max(0,Math.min(1,((point.x-track.points[0].x)*dx+(point.y-track.points[0].y)*dy)/Math.max(dx*dx+dy*dy,.0001)))};
const pointsFor=(lengthMm:number,room:{width:number;length:number},point:Point,rotation:number):[Point,Point]=>{const r=rotation*Math.PI/180,dx=Math.cos(r)*lengthMm/room.width*50,dy=Math.sin(r)*lengthMm/room.length*50,scale=Math.min(1,48/Math.max(Math.abs(dx),Math.abs(dy),1));return[{x:point.x-dx*scale,y:point.y-dy*scale},{x:point.x+dx*scale,y:point.y+dy*scale}]};
const shiftedTrackPoints=(points:[Point,Point],offset=3):[Point,Point]=>{const minX=Math.min(...points.map(point=>point.x)),maxX=Math.max(...points.map(point=>point.x)),minY=Math.min(...points.map(point=>point.y)),maxY=Math.max(...points.map(point=>point.y)),preferredX=maxX+offset<=100?offset:minX-offset>=0?-offset:0,preferredY=maxY+offset<=100?offset:minY-offset>=0?-offset:0,dx=Math.max(-minX,Math.min(100-maxX,preferredX)),dy=Math.max(-minY,Math.min(100-maxY,preferredY));return points.map(point=>({x:point.x+dx,y:point.y+dy})) as [Point,Point]};
const pointer=(event:ReactPointerEvent<HTMLElement>)=>{const surface=event.currentTarget.closest?.(".folio-plan,.folio-photo") as HTMLElement|null,rect=(surface||event.currentTarget).getBoundingClientRect();return{x:Math.max(0,Math.min(100,(event.clientX-rect.left)/rect.width*100)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)/rect.height*100))}};
const snapLine=(point:Point,previous?:Point)=>!previous?point:Math.abs(point.x-previous.x)>=Math.abs(point.y-previous.y)?{x:point.x,y:previous.y}:{x:previous.x,y:point.y};
const nearest=(point:Point,tracks:Track[],room:{width:number;length:number})=>{const px=point.x/100*room.width,py=point.y/100*room.length;let best:{trackId:string;point:Point;distance:number}|null=null;for(const track of tracks){const ax=track.points[0].x/100*room.width,ay=track.points[0].y/100*room.length,bx=track.points[1].x/100*room.width,by=track.points[1].y/100*room.length,vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/Math.max(vx*vx+vy*vy,1))),x=ax+vx*t,y=ay+vy*t,distance=Math.hypot(px-x,py-y);if(!best||distance<best.distance)best={trackId:track.id,point:{x:x/room.width*100,y:y/room.length*100},distance}}return best&&best.distance<=300?best:null};
const asDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("Не удалось прочитать изображение."));reader.readAsDataURL(file)});
const blobAsDataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||""));reader.onerror=()=>reject(new Error("Не удалось прочитать результат генерации."));reader.readAsDataURL(blob)});
const imageFrom=(source:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error("Не удалось подготовить изображение."));image.src=source});
const uniqueProducts=(tracks:Track[],fixtures:Fixture[])=>Array.from(new Map([...tracks.map(x=>x.product),...fixtures.map(x=>x.product)].map(x=>[x.id,x])).values());

async function renderPlan(room:{width:number;length:number},tracks:Track[],fixtures:Fixture[]){const canvas=document.createElement("canvas");canvas.width=1600;canvas.height=Math.max(900,Math.round(1600*room.length/room.width));const c=canvas.getContext("2d");if(!c)throw new Error("Не удалось подготовить план.");c.fillStyle="#fbfaf6";c.fillRect(0,0,canvas.width,canvas.height);c.strokeStyle="#ddd6cd";c.lineWidth=2;for(let x=0;x<=room.width;x+=500){const px=x/room.width*canvas.width;c.beginPath();c.moveTo(px,0);c.lineTo(px,canvas.height);c.stroke()}for(let y=0;y<=room.length;y+=500){const py=y/room.length*canvas.height;c.beginPath();c.moveTo(0,py);c.lineTo(canvas.width,py);c.stroke()}tracks.forEach(track=>{c.strokeStyle="#211d1a";c.lineWidth=14;c.lineCap="round";c.beginPath();c.moveTo(track.points[0].x/100*canvas.width,track.points[0].y/100*canvas.height);c.lineTo(track.points[1].x/100*canvas.width,track.points[1].y/100*canvas.height);c.stroke()});fixtures.forEach((fixture,index)=>{const x=fixture.point.x/100*canvas.width,y=fixture.point.y/100*canvas.height;c.fillStyle="#851626";c.beginPath();c.arc(x,y,22,0,Math.PI*2);c.fill();c.fillStyle="#fff";c.font="700 20px Arial";c.textAlign="center";c.textBaseline="middle";c.fillText(String(index+1),x,y)});return canvas.toDataURL("image/png")}
async function renderOverlay(source:string,tracks:Track[],fixtures:Fixture[]){const image=await imageFrom(source),canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext("2d");if(!c)throw new Error("Не удалось подготовить разметку.");c.drawImage(image,0,0);tracks.forEach(track=>{c.strokeStyle="#851626";c.lineWidth=Math.max(6,canvas.width*.006);c.lineCap="round";c.beginPath();c.moveTo(track.points[0].x/100*canvas.width,track.points[0].y/100*canvas.height);c.lineTo(track.points[1].x/100*canvas.width,track.points[1].y/100*canvas.height);c.stroke()});fixtures.forEach((fixture,index)=>{const x=fixture.point.x/100*canvas.width,y=fixture.point.y/100*canvas.height,r=Math.max(13,canvas.width*.014);c.fillStyle="#851626";c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.fillStyle="#fff";c.font=`700 ${r}px Arial`;c.textAlign="center";c.textBaseline="middle";c.fillText(String(index+1),x,y)});return canvas.toDataURL("image/png")}
async function renderPointMarker(source:string,point:Point){const image=await imageFrom(source),canvas=document.createElement("canvas");canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext("2d");if(!c)throw new Error("Не удалось подготовить точку редактирования.");c.drawImage(image,0,0);const x=point.x/100*canvas.width,y=point.y/100*canvas.height,r=Math.max(18,canvas.width*.018);c.strokeStyle="#851626";c.lineWidth=Math.max(6,canvas.width*.005);c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.moveTo(x-r*1.6,y);c.lineTo(x+r*1.6,y);c.moveTo(x,y-r*1.6);c.lineTo(x,y+r*1.6);c.stroke();return canvas.toDataURL("image/png")}

export default function TechnicalLighting(){
 const[mode,setMode]=useState<"plan"|"image">("plan"),[room,setRoom]=useState({width:6000,length:4500}),[tracks,setTracks]=useState<Track[]>([]),[fixtures,setFixtures]=useState<Fixture[]>([]),[selection,setSelection]=useState<Selection>(null),[drag,setDrag]=useState<Drag>(null),[rotationEditingId,setRotationEditingId]=useState<string|null>(null),[rotatingTrack,setRotatingTrack]=useState<RotateTrackDrag>(null),[roomResize,setRoomResize]=useState<RoomResizeDrag>(null),[planZoom,setPlanZoom]=useState(100);
 const[photo,setPhoto]=useState(""),[photoName,setPhotoName]=useState(""),[photoRatio,setPhotoRatio]=useState(16/9),[photoTracks,setPhotoTracks]=useState<Track[]>([]),[photoFixtures,setPhotoFixtures]=useState<Fixture[]>([]),[draft,setDraft]=useState<Point[]>([]),[editAction,setEditAction]=useState<EditAction>(null),[editPoint,setEditPoint]=useState<Point|null>(null),[previewOpen,setPreviewOpen]=useState(false),[upscaling,setUpscaling]=useState(false);
 const[products,setProducts]=useState<Product[]>([]),[referenceProducts,setReferenceProducts]=useState<Product[]>([]),[referenceUploadType,setReferenceUploadType]=useState<"track"|"track_fixture"|"fixture">("fixture"),[catalogType,setCatalogType]=useState<"all"|Product["type"]>("track"),[brand,setBrand]=useState("all"),[brands,setBrands]=useState<BrandOption[]>([{id:"gomoon",name:"GoMoon"}]),[brandMenuOpen,setBrandMenuOpen]=useState(false),[query,setQuery]=useState(""),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[catalogError,setCatalogError]=useState(""),[selectedProduct,setSelectedProduct]=useState<Product|null>(null);
 const[prompt,setPrompt]=useState(""),[cctK,setCctK]=useState(3000),[timeOfDay,setTimeOfDay]=useState<"day"|"night">("day"),[busy,setBusy]=useState(false),[error,setError]=useState(""),[history,setHistory]=useState<History[]>([]),[imageProducts,setImageProducts]=useState<Product[]>([]),[user,setUser]=useState<{email:string;firstName?:string}|null>(null),[apiReady,setApiReady]=useState(false),[projects,setProjects]=useState<ProjectOption[]>([]),[projectId,setProjectId]=useState(""),[projectName,setProjectName]=useState(""),[saveDialogOpen,setSaveDialogOpen]=useState(false),[saveMode,setSaveMode]=useState<"existing"|"new">("existing"),[saveTargetId,setSaveTargetId]=useState(""),[newProjectName,setNewProjectName]=useState("Технический свет"),[savingProject,setSavingProject]=useState(false),[projectSaved,setProjectSaved]=useState(false);const upload=useRef<HTMLInputElement>(null),referenceUpload=useRef<HTMLInputElement>(null),planClipboard=useRef<PlanClipboard>(null);
 useEffect(()=>{void Promise.all([fetch("/api/auth/me").then(r=>r.json()),fetch("/api/lighting/generate/status").then(r=>r.json())]).then(async([auth,status])=>{setUser(auth.user||null);setApiReady(Boolean(status.configured));if(auth.user){const response=await fetch("/api/projects"),payload=await response.json().catch(()=>({}));if(response.ok){const next=Array.isArray(payload.projects)?payload.projects:[];setProjects(next);setSaveTargetId(next[0]?.id||"")}}}).catch(()=>setApiReady(false))},[]);
 useEffect(()=>{if(!previewOpen)return;const previous=document.body.style.overflow,close=(event:KeyboardEvent)=>{if(event.key==="Escape")setPreviewOpen(false)};document.body.style.overflow="hidden";window.addEventListener("keydown",close);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",close)}},[previewOpen]);
 useEffect(()=>{const controller=new AbortController(),timer=window.setTimeout(()=>{setLoading(true);const search=new URLSearchParams({type:catalogType,brand,limit:"36",available:"1"});if(query.trim())search.set("q",query.trim());void fetch(`/api/lighting/catalog?${search}`,{signal:controller.signal}).then(async r=>{const p=await r.json();if(!r.ok)throw new Error(p.error);return p}).then(p=>{setProducts(p.products||[]);setBrands(Array.isArray(p.brands)&&p.brands.length?p.brands:[{id:"gomoon",name:"GoMoon"}]);setTotal(Number(p.total)||0);setCatalogError("")}).catch(e=>{if(e.name!=="AbortError")setCatalogError(e.message||"Не удалось загрузить каталог.")}).finally(()=>setLoading(false))},150);return()=>{clearTimeout(timer);controller.abort()}},[catalogType,brand,query]);
 const activeTracks=mode==="plan"?tracks:photoTracks,activeFixtures=mode==="plan"?fixtures:photoFixtures,sceneProducts=useMemo(()=>uniqueProducts(activeTracks,activeFixtures),[activeTracks,activeFixtures]);
 const imageProductIds=useMemo(()=>new Set(imageProducts.map(product=>product.id)),[imageProducts]);
 const visibleReferenceProducts=useMemo(()=>referenceProducts.filter(product=>catalogType==="all"||product.type===catalogType).sort((a,b)=>Number(imageProductIds.has(b.id))-Number(imageProductIds.has(a.id))),[referenceProducts,catalogType,imageProductIds]);
 const visibleCatalogProducts=useMemo(()=>{const matchingUsed=mode==="image"?imageProducts.filter(product=>!product.isReference&&(catalogType==="all"||product.type===catalogType)&&(brand==="all"||product.id.startsWith(`${brand}:`))&&(!query.trim()||`${product.name} ${product.article} ${product.categoryTrail}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU")))):[],merged=new Map([...matchingUsed,...products].map(product=>[product.id,product]));return Array.from(merged.values()).sort((a,b)=>Number(imageProductIds.has(b.id))-Number(imageProductIds.has(a.id)))},[mode,imageProducts,imageProductIds,catalogType,brand,query,products]);
 const placedReferenceProducts=useMemo(()=>sceneProducts.filter(product=>product.isReference),[sceneProducts]);
 const selectedTrack=selection?.kind==="track"?tracks.find(x=>x.id===selection.id):undefined,selectedFixture=selection?.kind==="fixture"?fixtures.find(x=>x.id===selection.id):undefined,selectedSceneProduct=selectedTrack?.product||selectedFixture?.product;
 const dragMeasurement=useMemo(()=>{if(!drag)return null;if(drag.kind==="track"){const track=tracks.find(item=>item.id===drag.id);if(!track)return null;const minX=Math.min(track.points[0].x,track.points[1].x),maxX=Math.max(track.points[0].x,track.points[1].x),minY=Math.min(track.points[0].y,track.points[1].y),maxY=Math.max(track.points[0].y,track.points[1].y);return{minX,maxX,minY,maxY,x:(minX+maxX)/2,y:(minY+maxY)/2,left:Math.round(minX/100*room.width),right:Math.round((100-maxX)/100*room.width),top:Math.round(minY/100*room.length),bottom:Math.round((100-maxY)/100*room.length)}}const fixture=fixtures.find(item=>item.id===drag.id);if(!fixture)return null;return{minX:fixture.point.x,maxX:fixture.point.x,minY:fixture.point.y,maxY:fixture.point.y,x:fixture.point.x,y:fixture.point.y,left:Math.round(fixture.point.x/100*room.width),right:Math.round((100-fixture.point.x)/100*room.width),top:Math.round(fixture.point.y/100*room.length),bottom:Math.round((100-fixture.point.y)/100*room.length)}},[drag,tracks,fixtures,room]);
 const relativeMeasurements=useMemo(()=>{if(!drag)return[];if(drag.kind==="track"){const moving=tracks.find(item=>item.id===drag.id);if(!moving||!fixtures.length)return[];const separate=fixtures.filter(fixture=>fixture.trackId!==moving.id),pool=separate.length?separate:fixtures,ax=moving.points[0].x/100*room.width,ay=moving.points[0].y/100*room.length,bx=moving.points[1].x/100*room.width,by=moving.points[1].y/100*room.length,vx=bx-ax,vy=by-ay;let fixtureMeasure:{kind:"fixture";from:Point;to:Point;distance:number;label:string}|null=null;for(const fixture of pool){const px=fixture.point.x/100*room.width,py=fixture.point.y/100*room.length,t=Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/Math.max(vx*vx+vy*vy,1))),x=ax+vx*t,y=ay+vy*t,distance=Math.hypot(px-x,py-y),index=fixtures.findIndex(item=>item.id===fixture.id),candidate={kind:"fixture" as const,from:{x:x/room.width*100,y:y/room.length*100},to:fixture.point,distance:Math.round(distance),label:`до светильника ${index+1}`};if(!fixtureMeasure||candidate.distance<fixtureMeasure.distance)fixtureMeasure=candidate}return fixtureMeasure?[fixtureMeasure]:[]}const moving=fixtures.find(item=>item.id===drag.id);if(!moving)return[];const px=moving.point.x/100*room.width,py=moving.point.y/100*room.length;let trackMeasure:{kind:"track";from:Point;to:Point;distance:number;label:string}|null=null;for(const track of tracks){const ax=track.points[0].x/100*room.width,ay=track.points[0].y/100*room.length,bx=track.points[1].x/100*room.width,by=track.points[1].y/100*room.length,vx=bx-ax,vy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*vx+(py-ay)*vy)/Math.max(vx*vx+vy*vy,1))),x=ax+vx*t,y=ay+vy*t,distance=Math.hypot(px-x,py-y),candidate={kind:"track" as const,from:moving.point,to:{x:x/room.width*100,y:y/room.length*100},distance:Math.round(distance),label:"до трека"};if(!trackMeasure||candidate.distance<trackMeasure.distance)trackMeasure=candidate}let fixtureMeasure:{kind:"fixture";from:Point;to:Point;distance:number;label:string}|null=null;fixtures.forEach((fixture,index)=>{if(fixture.id===moving.id)return;const distance=Math.hypot((fixture.point.x-moving.point.x)/100*room.width,(fixture.point.y-moving.point.y)/100*room.length),candidate={kind:"fixture" as const,from:moving.point,to:fixture.point,distance:Math.round(distance),label:`до светильника ${index+1}`};if(!fixtureMeasure||candidate.distance<fixtureMeasure.distance)fixtureMeasure=candidate});return[trackMeasure,fixtureMeasure].filter((measurement):measurement is NonNullable<typeof measurement>=>Boolean(measurement))},[drag,tracks,fixtures,room]);
 useEffect(()=>{if(mode!=="plan")return;const handleKeyDown=(event:KeyboardEvent)=>{if(!(event.ctrlKey||event.metaKey)||event.altKey)return;const target=event.target as HTMLElement|null;if(target?.closest("input, textarea, select, [contenteditable='true']"))return;const key=event.key.toLowerCase();if(key==="c"&&selection){if(selection.kind==="track"){const track=tracks.find(item=>item.id===selection.id);if(track)planClipboard.current={kind:"track",track:{...track,points:track.points.map(point=>({...point})) as [Point,Point]}}}else{const fixture=fixtures.find(item=>item.id===selection.id);if(fixture)planClipboard.current={kind:"fixture",fixture:{...fixture,point:{...fixture.point}}}}event.preventDefault()}if(key==="v"&&planClipboard.current){if(planClipboard.current.kind==="track"){const source=planClipboard.current.track,id=crypto.randomUUID(),track:Track={...source,id,points:shiftedTrackPoints(source.points)};setTracks(items=>[...items,track]);setSelection({kind:"track",id});planClipboard.current={kind:"track",track}}else{const source=planClipboard.current.fixture,id=crypto.randomUUID(),fixture:Fixture={...source,id,point:{x:Math.min(100,source.point.x+3),y:Math.min(100,source.point.y+3)},trackId:undefined};setFixtures(items=>[...items,fixture]);setSelection({kind:"fixture",id});planClipboard.current={kind:"fixture",fixture}}event.preventDefault()}};window.addEventListener("keydown",handleKeyDown);return()=>window.removeEventListener("keydown",handleKeyDown)},[mode,selection,tracks,fixtures]);
 const addProduct=(product:Product)=>{setSelectedProduct(product);setError("");if(mode==="image")return;if(product.type==="track"){const id=crypto.randomUUID(),lengthMm=product.specs.lengthMm||2000,track={id,product,lengthMm,rotation:0,points:pointsFor(lengthMm,room,{x:50,y:34+(tracks.length%4)*11},0)};setTracks(v=>[...v,track]);setSelection({kind:"track",id})}else if(product.type==="fixture"||product.type==="track_fixture"){const id=crypto.randomUUID(),track=selectedTrack||tracks[0],trackFixture=product.type==="track_fixture"||/треков|galileo/i.test(product.categoryTrail);if(trackFixture&&!track){setError("Сначала добавьте трек, затем установите на него трековый светильник.");return}const fixture:Fixture=track&&trackFixture?{id,product,point:at(track,.5),trackId:track.id}:{id,product,point:{x:46+(fixtures.length%4)*3,y:48+(fixtures.length%3)*5}};setFixtures(v=>[...v,fixture]);setSelection({kind:"fixture",id})}};
 const uploadReferenceProduct=async(file?:File)=>{if(!file)return;try{const image=await asDataUrl(file),referenceName=referenceUploadType==="track"?"трека":referenceUploadType==="track_fixture"?"трекового светильника":"светильника",product:Product={id:`reference-${crypto.randomUUID()}`,article:`REF-${String(referenceProducts.length+1).padStart(3,"0")}`,name:file.name.replace(/\.[^.]+$/,"")||`Референс ${referenceName}`,image,price:0,available:true,categoryTrail:"Пользовательский референс",type:referenceUploadType,isReference:true,specs:{powerW:null,voltageV:null,cctK:null,beamDeg:null,widthMm:null,lengthMm:null}};setReferenceProducts(items=>[...items,product]);addProduct(product)}catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить референс.")}};
 const updateReferenceDimension=(id:string,key:"widthMm"|"lengthMm",raw:string)=>{const value=raw===""?null:Math.max(1,Math.round(Number(raw)||0)),update=(product:Product):Product=>product.id===id?{...product,specs:{...product.specs,[key]:value}}:product;setReferenceProducts(items=>items.map(update));setSelectedProduct(product=>product?update(product):product);setTracks(items=>items.map(track=>{if(track.product.id!==id)return track;const product=update(track.product),lengthMm=key==="lengthMm"&&value?value:track.lengthMm;return{...track,product,lengthMm,points:key==="lengthMm"&&value?shiftedTrackPoints(pointsFor(value,room,center(track),track.rotation),0):track.points}}));setFixtures(items=>items.map(fixture=>fixture.product.id===id?{...fixture,product:update(fixture.product)}:fixture));setPhotoTracks(items=>items.map(track=>track.product.id===id?{...track,product:update(track.product)}:track));setPhotoFixtures(items=>items.map(fixture=>fixture.product.id===id?{...fixture,product:update(fixture.product)}:fixture))};
 const photoPoint=(point:Point)=>{setError("");if(!editAction){setPreviewOpen(true);return}if(editAction!=="add"){setEditPoint(point);return}if(!selectedProduct||!["track","fixture","track_fixture"].includes(selectedProduct.type)){setError("Сначала выберите трек или светильник в каталоге.");return}if(selectedProduct.type!=="track")setPhotoFixtures(v=>[...v,{id:crypto.randomUUID(),point,product:selectedProduct}]);else setDraft(v=>[...v,snapLine(point,v.at(-1))])};
 const chooseEditAction=(action:Exclude<EditAction,null>)=>{setEditAction(current=>current===action?null:action);setEditPoint(null);setDraft([]);setError("")};
 const finishDraft=()=>{if(draft.length>1&&selectedProduct)setPhotoTracks(v=>[...v,{id:crypto.randomUUID(),points:[draft[0],draft.at(-1)!],product:selectedProduct,lengthMm:0,rotation:0}]);setDraft([])};
 const setTrackRotationById=(id:string,degrees:number)=>{const track=tracks.find(item=>item.id===id);if(!track)return;const rotation=((Math.round(degrees)%360)+360)%360,next=shiftedTrackPoints(pointsFor(track.lengthMm,room,center(track),rotation),0),fractions=new Map(fixtures.filter(item=>item.trackId===track.id).map(item=>[item.id,fractionAt(track,item.point)]));setTracks(items=>items.map(item=>item.id===track.id?{...item,rotation,points:next}:item));setFixtures(items=>items.map(item=>item.trackId===track.id?{...item,point:at({...track,points:next},fractions.get(item.id)??.5)}:item))};
 const updateRoomDimensions=(next:{width:number;length:number})=>{const sized={width:Math.max(1000,Math.min(20000,Math.round(next.width))),length:Math.max(1000,Math.min(20000,Math.round(next.length)))},nextTracks=tracks.map(track=>({...track,points:shiftedTrackPoints(pointsFor(track.lengthMm,sized,center(track),track.rotation),0)})),byId=new Map(nextTracks.map(track=>[track.id,track]));setFixtures(items=>items.map(fixture=>{if(!fixture.trackId)return fixture;const previous=tracks.find(track=>track.id===fixture.trackId),resized=byId.get(fixture.trackId);return previous&&resized?{...fixture,point:at(resized,fractionAt(previous,fixture.point))}:fixture}));setTracks(nextTracks);setRoom(sized)};
 const startRoomResize=(side:NonNullable<RoomResizeDrag>["side"],event:ReactPointerEvent<HTMLButtonElement>)=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);const plan=event.currentTarget.closest(".folio-plan") as HTMLElement,rect=plan.getBoundingClientRect();setSelection(null);setRotationEditingId(null);setDrag(null);setRotatingTrack(null);setRoomResize({side,x:event.clientX,y:event.clientY,width:room.width,length:room.length,pixelWidth:rect.width,pixelHeight:rect.height})};
 const move=(event:ReactPointerEvent<HTMLDivElement>)=>{if(roomResize){const horizontal=roomResize.side==="left"||roomResize.side==="right",pixels=horizontal?event.clientX-roomResize.x:event.clientY-roomResize.y,scale=horizontal?roomResize.width/roomResize.pixelWidth:roomResize.length/roomResize.pixelHeight,direction=roomResize.side==="left"||roomResize.side==="top"?-1:1,delta=pixels*scale*direction;updateRoomDimensions(horizontal?{width:roomResize.width+delta,length:roomResize.length}:{width:roomResize.width,length:roomResize.length+delta});return}if(rotatingTrack){const angle=Math.atan2(event.clientY-rotatingTrack.centerY,event.clientX-rotatingTrack.centerX)*180/Math.PI;setTrackRotationById(rotatingTrack.id,rotatingTrack.startRotation+angle-rotatingTrack.startAngle);return}if(!drag)return;const p=pointer(event);if(drag.kind==="track"){const track=tracks.find(x=>x.id===drag.id);if(!track)return;let dx=p.x-drag.last.x,dy=p.y-drag.last.y;const xs=track.points.map(x=>x.x),ys=track.points.map(x=>x.y);dx=Math.max(-Math.min(...xs),Math.min(100-Math.max(...xs),dx));dy=Math.max(-Math.min(...ys),Math.min(100-Math.max(...ys),dy));setTracks(v=>v.map(x=>x.id===track.id?{...x,points:x.points.map(q=>({x:q.x+dx,y:q.y+dy})) as [Point,Point]}:x));setFixtures(v=>v.map(x=>x.trackId===track.id?{...x,point:{x:x.point.x+dx,y:x.point.y+dy}}:x))}else setFixtures(v=>v.map(x=>x.id===drag.id?{...x,point:p,trackId:undefined}:x));setDrag({...drag,last:p})};
 const endDrag=()=>{if(drag?.kind==="fixture")setFixtures(v=>v.map(x=>{if(x.id!==drag.id)return x;const hit=nearest(x.point,tracks,room);return hit?{...x,point:hit.point,trackId:hit.trackId}:{...x,trackId:undefined}}));setDrag(null);setRotatingTrack(null);setRoomResize(null)};
 const setTrackRotation=(degrees:number)=>{if(selectedTrack)setTrackRotationById(selectedTrack.id,degrees)};
 const rotate=()=>setTrackRotation((selectedTrack?.rotation||0)+90);
 const remove=()=>{if(!selection)return;if(selection.kind==="track"){setTracks(v=>v.filter(x=>x.id!==selection.id));setFixtures(v=>v.map(x=>x.trackId===selection.id?{...x,trackId:undefined}:x));setRotationEditingId(null);setRotatingTrack(null)}else setFixtures(v=>v.filter(x=>x.id!==selection.id));setSelection(null)};
 const uploadPhoto=async(file?:File)=>{if(!file)return;try{const src=await asDataUrl(file),image=await imageFrom(src);setPhoto(src);setPhotoName(file.name);setPhotoRatio(image.naturalWidth/image.naturalHeight);setImageProducts([]);setEditAction(null);setEditPoint(null);setPhotoTracks([]);setPhotoFixtures([])}catch(e){setError(e instanceof Error?e.message:"Не удалось загрузить изображение.")}};
 const undo=()=>{if(mode==="plan"){if(fixtures.length)setFixtures(v=>v.slice(0,-1));else setTracks(v=>v.slice(0,-1));setSelection(null);setRotationEditingId(null);setRotatingTrack(null)}else if(draft.length)setDraft(v=>v.slice(0,-1));else if(photoFixtures.length)setPhotoFixtures(v=>v.slice(0,-1));else setPhotoTracks(v=>v.slice(0,-1))};
 const clear=()=>{setSelection(null);setRotationEditingId(null);setRotatingTrack(null);if(mode==="plan"){setTracks([]);setFixtures([])}else{setPhotoTracks([]);setPhotoFixtures([]);setDraft([]);setEditPoint(null)}};
 const changePlanZoom=(next:number)=>setPlanZoom(Math.max(50,Math.min(180,Math.round(next/10)*10)));
 const zoomPlanWithWheel=(event:ReactWheelEvent<HTMLDivElement>)=>{event.preventDefault();changePlanZoom(planZoom+(event.deltaY<0?10:-10))};
 const applySavedLighting=(value:unknown)=>{if(!value||typeof value!=="object")return;const saved=value as {room?:{width?:number;length?:number};tracks?:Track[];fixtures?:Fixture[];photo?:string;photoName?:string;photoRatio?:number;cctK?:number;timeOfDay?:"day"|"night"};if(saved.room?.width&&saved.room?.length)setRoom({width:saved.room.width,length:saved.room.length});const nextTracks=Array.isArray(saved.tracks)?saved.tracks:[],nextFixtures=Array.isArray(saved.fixtures)?saved.fixtures:[];setTracks(nextTracks);setFixtures(nextFixtures);setReferenceProducts(uniqueProducts(nextTracks,nextFixtures).filter(product=>product.isReference));if(saved.photo){setPhoto(saved.photo);setPhotoName(saved.photoName||"Сохранённая визуализация");setPhotoRatio(saved.photoRatio||16/9);setImageProducts(uniqueProducts(nextTracks,nextFixtures))}if(saved.cctK)setCctK(saved.cctK);if(saved.timeOfDay)setTimeOfDay(saved.timeOfDay)};
 const saveTechnicalProject=async(targetId:string)=>{setSavingProject(true);setError("");try{const response=await fetch(`/api/projects/${encodeURIComponent(targetId)}/technical-lighting`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({technicalLighting:{room,tracks,fixtures,photo,photoName,photoRatio,cctK,timeOfDay}})}),payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось сохранить проект.");setProjectId(targetId);setProjectName(payload.project?.name||projectName||"Проект");setProjectSaved(true);setSaveDialogOpen(false);const url=new URL(window.location.href);url.searchParams.set("project",targetId);window.history.replaceState(window.history.state,"",`${url.pathname}${url.search}${url.hash}`);setProjects(items=>{const project=payload.project as ProjectOption;return[project,...items.filter(item=>item.id!==project.id)]})}catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить проект.")}finally{setSavingProject(false)}};
 const chooseProjectAndSave=async()=>{if(saveMode==="existing"){if(!saveTargetId){setError("Выберите существующий проект.");return}await saveTechnicalProject(saveTargetId);return}const name=newProjectName.trim();if(!name){setError("Введите название нового проекта.");return}setSavingProject(true);setError("");try{const response=await fetch("/api/projects",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,projectType:"Квартира",description:"Проект технического света"})}),payload=await response.json().catch(()=>({}));if(!response.ok||!payload.project?.id)throw new Error(payload.error||"Не удалось создать проект.");setSavingProject(false);await saveTechnicalProject(String(payload.project.id))}catch(e){setSavingProject(false);setError(e instanceof Error?e.message:"Не удалось создать проект.")}};
 const requestProjectSave=()=>{if(!user){setError("Войдите на главной странице ROOM design, чтобы сохранить проект.");return}if(projectId){void saveTechnicalProject(projectId);return}setSaveMode(projects.length?"existing":"new");setSaveTargetId(projects[0]?.id||"");setSaveDialogOpen(true)};
 useEffect(()=>{if(!user)return;const id=new URLSearchParams(window.location.search).get("project");if(!id)return;const controller=new AbortController();void fetch(`/api/projects/${encodeURIComponent(id)}/technical-lighting`,{signal:controller.signal}).then(async response=>{const payload=await response.json().catch(()=>({}));if(!response.ok)throw new Error(payload.error||"Не удалось открыть проект.");return payload}).then(payload=>{setProjectId(id);setProjectName(payload.project?.name||"Проект");applySavedLighting(payload.technicalLighting);setProjectSaved(true)}).catch(e=>{if(e.name!=="AbortError")setError(e instanceof Error?e.message:"Не удалось открыть проект.")});return()=>controller.abort()},[user]);
 const downloadPhoto=async()=>{if(!photo)return;try{const blob=photo.startsWith("data:")?await (await fetch(photo)).blob():await fetch(photo).then(response=>{if(!response.ok)throw new Error();return response.blob()}),extension=blob.type.includes("png")?"png":blob.type.includes("jpeg")?"jpg":"webp",url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download=`room-design-technical-lighting-${Date.now()}.${extension}`;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)}catch{setError("Не удалось скачать изображение. Попробуйте ещё раз.")}};
 const upscalePhoto=async()=>{if(!photo||busy)return;if(!user){setError("Войдите на главной странице ROOM design, чтобы выполнить апскейл.");return}if(!apiReady){setError("API генерации недоступен.");return}setBusy(true);setUpscaling(true);setError("");try{const outputSize=photoRatio>1.15?"1536x1024":"1024x1024",response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({operation:"upscale",prompt:"Выполнить технический апскейл без изменения композиции, предметов, света и кадра.",roomImage:photo,upscale:true,outputSize})});if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось выполнить апскейл.")}const image=await blobAsDataUrl(await response.blob()),rendered=await imageFrom(image);setHistory(v=>[{id:crypto.randomUUID(),image,label:"Апскейл",products:imageProducts},...v].slice(0,5));setPhoto(image);setPhotoName("Апскейл интерьера");setPhotoRatio(rendered.naturalWidth/rendered.naturalHeight);setEditAction(null);setEditPoint(null);setPreviewOpen(true)}catch(e){setError(e instanceof Error?e.message:"Не удалось выполнить апскейл.")}finally{setUpscaling(false);setBusy(false)}};
 const generate=async()=>{
  if(mode==="plan"&&!tracks.length&&!fixtures.length){setError("Добавьте из каталога хотя бы один трек или светильник.");return}
  if(mode==="image"&&!photo){setError("Сначала загрузите или создайте изображение интерьера.");return}
  const incompleteReference=sceneProducts.find(product=>product.isReference&&(!product.specs.widthMm||!product.specs.lengthMm));
  if(incompleteReference){setError(`Укажите ширину и длину для референса «${incompleteReference.name}».`);return}
  if(mode==="image"&&editAction==="replace"&&(!editPoint||!selectedProduct?.image)){setError("Выберите светильник в каталоге и поставьте точку на заменяемом светильнике.");return}
  if(mode==="image"&&editAction==="remove"&&!editPoint){setError("Поставьте точку на светильнике, который нужно удалить.");return}
  if(mode==="image"&&editAction==="add"&&!photoTracks.length&&!photoFixtures.length&&!prompt.trim()){setError("Добавьте светильник на изображение или напишите корректирующую инструкцию.");return}
  if(mode==="image"&&!editAction&&!prompt.trim()){setError("Выберите действие «Добавить», «Заменить» или «Удалить» либо напишите корректирующую инструкцию.");return}
  if(!user){setError("Войдите на главной странице ROOM design, чтобы запустить генерацию.");return}
  if(!apiReady){setError("API генерации недоступен.");return}
  setBusy(true);setError("");
  try{
   const productPayload=sceneProducts.map(x=>({name:x.name,article:x.article,type:label(x.type),widthMm:x.specs.widthMm||null,lengthMm:x.specs.lengthMm||null,source:x.isReference?"reference":"catalog",quantity:[...activeTracks.map(item=>item.product.id),...activeFixtures.map(item=>item.product.id)].filter(id=>id===x.id).length})),references=sceneProducts.map(x=>x.image).filter(Boolean),trackItems=activeTracks.map((track,index)=>({number:index+1,name:track.product.name,article:track.product.article,lengthMm:track.lengthMm})),fixtureItems=activeFixtures.map((fixture,index)=>({marker:index+1,name:fixture.product.name,article:fixture.product.article,mounting:fixture.product.type==="track_fixture"||fixture.trackId?"track":"ceiling"})),outputSize=photoRatio>1.15?"1536x1024":"1024x1024";
   let body:Record<string,unknown>;
   if(mode==="plan")body={operation:"plan_render",prompt:DEFAULT_PLAN_PROMPT,outputSize:"1536x1024",lightingPlan:{planImage:await renderPlan(room,tracks,fixtures),room,referenceImages:references,products:productPayload,tracks:trackItems,fixtures:fixtureItems,trackCount:tracks.length,fixtureCount:fixtures.length,cctK,timeOfDay}};
   else if(editAction==="replace"&&editPoint&&selectedProduct)body={operation:"replace",roomImage:photo,referenceImage:selectedProduct.image,outputSize,pointEdit:{...editPoint,markedImage:await renderPointMarker(photo,editPoint)},replacement:{name:`светильник на ${selectedProduct.name}`}};
   else if(editAction==="remove"&&editPoint)body={operation:"remove",roomImage:photo,outputSize,pointEdit:{...editPoint,markedImage:await renderPointMarker(photo,editPoint)},removal:{name:"выбранный светильник"}};
   else if(photoTracks.length||photoFixtures.length)body={operation:"place",prompt,roomImage:photo,outputSize,lightingEdit:{overlayImage:await renderOverlay(photo,photoTracks,photoFixtures),referenceImages:references,products:productPayload,tracks:trackItems,fixtures:fixtureItems,trackCount:photoTracks.length,fixtureCount:photoFixtures.length,cctK,timeOfDay}};
   else{const instruction=`${prompt.trim()} Освещение: ${cctK} K, время суток: ${timeOfDay==="night"?"ночь":"день"}.`.trim();body={operation:"global_edit",prompt:instruction,roomImage:photo,outputSize,globalEdit:{instruction}}}
   const response=await fetch("/api/generate",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify(body)});
   if(!response.ok){const payload=await response.json().catch(()=>({}));throw new Error(payload.error||"Не удалось создать визуализацию.")}
   const image=await blobAsDataUrl(await response.blob()),rendered=await imageFrom(image),historyLabel=mode==="plan"?"По плану потолка":editAction==="replace"?"Замена светильника":editAction==="remove"?"Удаление светильника":"Редактирование света",nextImageProducts=mode==="plan"?sceneProducts:Array.from(new Map([...imageProducts,...(editAction==="replace"&&selectedProduct?[selectedProduct]:[]),...(photoTracks.length||photoFixtures.length?sceneProducts:[])].map(product=>[product.id,product])).values());
   setHistory(v=>[{id:crypto.randomUUID(),image,label:historyLabel,products:nextImageProducts},...v].slice(0,5));setPhoto(image);setPhotoName("Созданный интерьер");setPhotoRatio(rendered.naturalWidth/rendered.naturalHeight);setImageProducts(nextImageProducts);setMode("image");setPhotoTracks([]);setPhotoFixtures([]);setDraft([]);setEditPoint(null);setEditAction(null);setPrompt("");
  }catch(e){setError(e instanceof Error?e.message:"Не удалось создать визуализацию.")}finally{setBusy(false)}
 };
 return <main className="folio-app">
<header className="folio-header">
<Link href="/" className="folio-brand">ROOM DESIGN</Link>
<nav className="folio-mode">
<button className={mode==="image"?"active":""} onClick={()=>{finishDraft();setMode("image")}}>Редактор изображений</button>
<button className={mode==="plan"?"active":""} onClick={()=>{finishDraft();setMode("plan")}}>Создание интерьера</button>
</nav>
<div className="folio-header-actions">
<span className={apiReady?"ready":""}>● {apiReady?"Генерация готова":"API недоступен"}</span>
<Link href="/">{user?user.firstName||user.email:"Войти"}</Link>
</div>
</header>
 <section className="folio-studio">
<aside className="folio-left">
<section>
<span className="folio-number">01</span>
<i/>
<h2>{mode==="plan"?"План потолка":"Исходное изображение"}</h2>{mode==="plan"?<div className="folio-dimensions">
<label>Ширина, мм<input type="number" value={room.width} onChange={e=>updateRoomDimensions({...room,width:Math.max(1000,+e.target.value||1000)})}/>
</label>
<label>Длина, мм<input type="number" value={room.length} onChange={e=>updateRoomDimensions({...room,length:Math.max(1000,+e.target.value||1000)})}/>
</label>
</div>:<button className="folio-upload-mini" onClick={()=>upload.current?.click()}>{photo?<img src={photo} alt="Исходный интерьер"/>:<>
<b>＋</b>
<span>Загрузить интерьер</span>
</>}</button>}</section>
<section>
<span className="folio-number">02</span>
<i/>
<h2>Параметры света</h2>
<div className="folio-light-settings">
<label>Температура<select value={cctK} onChange={e=>setCctK(Number(e.target.value))}><option value="2700">2700 K · тёплый</option><option value="3000">3000 K · мягкий</option><option value="4000">4000 K · нейтральный</option><option value="5000">5000 K · холодный</option></select></label>
<div className="folio-time-setting"><span>Время суток</span><span className="folio-time-switch"><button className={timeOfDay==="day"?"active":""} onClick={()=>setTimeOfDay("day")}>День</button><button className={timeOfDay==="night"?"active":""} onClick={()=>setTimeOfDay("night")}>Ночь</button></span></div>
</div>{placedReferenceProducts.length>0&&<div className="folio-reference-specs">
<h3>Референсы</h3>{placedReferenceProducts.map(product=><article key={product.id}>
<img src={product.image} alt=""/><div><b>{product.name}</b><small>{product.type==="track"?"Трек из референса":product.type==="track_fixture"?"Трековый светильник из референса":"Светильник из референса"}</small></div>
<label>Ширина, мм<input type="number" min="1" value={product.specs.widthMm||""} onChange={e=>updateReferenceDimension(product.id,"widthMm",e.target.value)} placeholder="Обязательно"/></label>
<label>Длина, мм<input type="number" min="1" value={product.specs.lengthMm||""} onChange={e=>updateReferenceDimension(product.id,"lengthMm",e.target.value)} placeholder="Обязательно"/></label>
</article>)}</div>}
</section>{mode==="image"&&photo&&<section className="folio-correction">
<span className="folio-number">03</span>
<i/>
<h2>Корректировка изображения</h2>
<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder="Например: изменить цвет потолка на серый"/>
</section>}
{mode==="plan"?<div className="folio-note">Дважды кликните левой кнопкой по треку, затем тяните появившийся маркер вращения. Ctrl/Cmd+C и Ctrl/Cmd+V копируют выбранный элемент.</div>:<div className="folio-apply-wrap">
<button className="folio-apply" type="button" onClick={()=>void generate()} disabled={busy||!photo}>{busy?"Применяем изменения…":"Применить изменения →"}</button>
{error&&<p role="alert">{error}</p>}
</div>}
</aside>
 <section className="folio-workspace">
<header>
<div>
<small>{mode==="plan"?"ПЛАНОГРАММА ПОТОЛКА":"РЕДАКТОР ИЗОБРАЖЕНИЯ"}</small>
<b>{mode==="plan"?`${room.width} × ${room.length} мм`:photoName||"Изображение не загружено"}</b>
</div>
<div className="folio-workspace-controls">{mode==="plan"&&<div className="folio-zoom-control" aria-label="Масштаб планограммы">
<button type="button" onClick={()=>changePlanZoom(planZoom-10)} aria-label="Уменьшить масштаб">−</button><output>{planZoom}%</output><button type="button" onClick={()=>changePlanZoom(planZoom+10)} aria-label="Увеличить масштаб">＋</button>
</div>}<button type="button" className={projectSaved?"folio-project-save saved":"folio-project-save"} onClick={requestProjectSave} disabled={savingProject}>{savingProject?"Сохраняем…":projectSaved?`✓ ${projectName||"Сохранено"}`:"Сохранить проект"}</button></div>
</header>
<div className="folio-canvas">{mode==="plan"?<div className="folio-plan" style={{width:`${94*planZoom/100}%`,maxWidth:`${850*planZoom/100}px`,maxHeight:"none",aspectRatio:`${room.width}/${room.length}`,backgroundImage:"linear-gradient(#eee9e3 1px,transparent 1px),linear-gradient(90deg,#eee9e3 1px,transparent 1px),linear-gradient(#d5ccc4 1px,transparent 1px),linear-gradient(90deg,#d5ccc4 1px,transparent 1px)",backgroundSize:`${10000/room.width}% ${10000/room.length}%,${10000/room.width}% ${10000/room.length}%,${50000/room.width}% ${50000/room.length}%,${50000/room.width}% ${50000/room.length}%`}} onWheel={zoomPlanWithWheel} onPointerDown={event=>{if(event.button!==0)return;const target=event.target as Element;if(target.closest(".folio-track-hit,.folio-track-rotate-handle,.folio-fixture"))return;setSelection(null);setRotationEditingId(null);setRotatingTrack(null);setDrag(null)}} onPointerMove={move} onPointerUp={endDrag} onPointerLeave={endDrag}>
<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="План технического света">{tracks.map(track=>{const c=center(track),handle=rotationHandle(track),selected=selection?.kind==="track"&&selection.id===track.id,editing=rotationEditingId===track.id;return <g key={track.id} className={`${selected?"selected":""}${editing?" editing":""}`} onDoubleClick={e=>{e.preventDefault();e.stopPropagation();setSelection({kind:"track",id:track.id});setRotationEditingId(track.id);setDrag(null)}} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();setRotationEditingId(null);setRotatingTrack(null);setSelection({kind:"track",id:track.id});setDrag({kind:"track",id:track.id,last:pointer(e as unknown as ReactPointerEvent<HTMLElement>)})}}>
<line className="folio-track-hit" x1={track.points[0].x} y1={track.points[0].y} x2={track.points[1].x} y2={track.points[1].y}/>
<line className="folio-track" x1={track.points[0].x} y1={track.points[0].y} x2={track.points[1].x} y2={track.points[1].y}/>
<text className="folio-track-size" x={c.x} y={c.y-2.5}>{lengthLabel(track.lengthMm)}</text>{editing&&<g className="folio-track-rotate-handle" role="button" aria-label="Повернуть трек" onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);const surface=e.currentTarget.closest(".folio-plan") as HTMLElement,rect=surface.getBoundingClientRect(),centerX=rect.left+c.x/100*rect.width,centerY=rect.top+c.y/100*rect.height;setDrag(null);setRotatingTrack({id:track.id,centerX,centerY,startAngle:Math.atan2(e.clientY-centerY,e.clientX-centerX)*180/Math.PI,startRotation:track.rotation})}}><line x1={track.points[1].x} y1={track.points[1].y} x2={handle.x} y2={handle.y}/><circle cx={handle.x} cy={handle.y} r="2.4"/><text x={handle.x} y={handle.y+.8}>↻</text></g>}
</g>})}{fixtures.map((fixture,index)=>
<g key={fixture.id} className={`folio-fixture ${selection?.kind==="fixture"&&selection.id===fixture.id?"selected":""}`} onPointerDown={e=>{e.preventDefault();e.stopPropagation();setRotationEditingId(null);setRotatingTrack(null);setSelection({kind:"fixture",id:fixture.id});setDrag({kind:"fixture",id:fixture.id,last:pointer(e as unknown as ReactPointerEvent<HTMLElement>)})}}>
<circle className="folio-fixture-hit" cx={fixture.point.x} cy={fixture.point.y} r="3"/>
<circle cx={fixture.point.x} cy={fixture.point.y} r="1.35"/>
<text x={fixture.point.x} y={fixture.point.y+.55}>{index+1}</text>{fixture.trackId&&<circle className="folio-snap-ring" cx={fixture.point.x} cy={fixture.point.y} r="2.1"/>}</g>)}{relativeMeasurements.map(measurement=><g key={measurement.kind} className={`folio-relative-measure ${measurement.kind}`}>
<line x1={measurement.from.x} y1={measurement.from.y} x2={measurement.to.x} y2={measurement.to.y}/><circle cx={measurement.to.x} cy={measurement.to.y} r=".75"/><text x={(measurement.from.x+measurement.to.x)/2} y={(measurement.from.y+measurement.to.y)/2-1.5}>{measurement.label} · {measurement.distance} мм</text>
</g>)}</svg>
<span className="folio-room-measure width">{room.width} мм</span><span className="folio-room-measure length">{room.length} мм</span>
{(["top","right","bottom","left"] as const).map(side=><button key={side} type="button" className={`folio-room-resize ${side}`} aria-label={`Изменить ${side==="left"||side==="right"?"ширину":"длину"} плана со стороны ${side}`} onPointerDown={event=>startRoomResize(side,event)}/>)}
{dragMeasurement&&<div className="folio-measurements" aria-live="polite">
<i className="left" style={{left:0,top:`${dragMeasurement.y}%`,width:`${dragMeasurement.minX}%`}}/><i className="right" style={{left:`${dragMeasurement.maxX}%`,top:`${dragMeasurement.y}%`,width:`${100-dragMeasurement.maxX}%`}}/><i className="top" style={{left:`${dragMeasurement.x}%`,top:0,height:`${dragMeasurement.minY}%`}}/><i className="bottom" style={{left:`${dragMeasurement.x}%`,top:`${dragMeasurement.maxY}%`,height:`${100-dragMeasurement.maxY}%`}}/>
<span className="left" style={{left:`${dragMeasurement.minX/2}%`,top:`${dragMeasurement.y}%`}}>{dragMeasurement.left} мм</span><span className="right" style={{left:`${dragMeasurement.maxX+(100-dragMeasurement.maxX)/2}%`,top:`${dragMeasurement.y}%`}}>{dragMeasurement.right} мм</span><span className="top" style={{left:`${dragMeasurement.x}%`,top:`${dragMeasurement.minY/2}%`}}>{dragMeasurement.top} мм</span><span className="bottom" style={{left:`${dragMeasurement.x}%`,top:`${dragMeasurement.maxY+(100-dragMeasurement.maxY)/2}%`}}>{dragMeasurement.bottom} мм</span>
</div>}{!tracks.length&&!fixtures.length&&<div className="folio-empty">
<b>План пока пуст</b>
<span>Нажмите на товар в каталоге — он сразу появится здесь.</span>
</div>}</div>:photo?<div className={`folio-photo ${editAction?"editing":"viewing"}`} style={{aspectRatio:photoRatio}} onPointerDown={e=>photoPoint(pointer(e))} role={!editAction?"button":undefined} tabIndex={!editAction?0:undefined} aria-label={!editAction?"Открыть изображение на весь экран":undefined} onKeyDown={e=>{if(!editAction&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setPreviewOpen(true)}}}>
<img src={photo} alt="Интерьер"/>
<svg viewBox="0 0 100 100" preserveAspectRatio="none">{photoTracks.map(track=>
<line key={track.id} className="folio-photo-track" x1={track.points[0].x} y1={track.points[0].y} x2={track.points[1].x} y2={track.points[1].y}/>)}{draft.length>0&&<polyline className="folio-photo-track draft" points={draft.map(x=>`${x.x},${x.y}`).join(" ")}/>} {photoFixtures.map((fixture,index)=>
<g key={fixture.id}>
<circle cx={fixture.point.x} cy={fixture.point.y} r="1.6"/>
<text x={fixture.point.x} y={fixture.point.y+.6}>{index+1}</text>
</g>)}{editPoint&&<g className={`folio-edit-point ${editAction}`}><circle cx={editPoint.x} cy={editPoint.y} r="2.2"/><line x1={editPoint.x-3.2} y1={editPoint.y} x2={editPoint.x+3.2} y2={editPoint.y}/><line x1={editPoint.x} y1={editPoint.y-3.2} x2={editPoint.x} y2={editPoint.y+3.2}/></g>}</svg>
</div>:<button className="folio-upload" onClick={()=>upload.current?.click()}>
<b>＋</b>
<strong>Загрузить изображение потолка</strong>
<span>JPG, PNG или WEBP</span>
</button>}</div>
<footer className="folio-workspace-footer">{mode==="image"&&<>
<button className={editAction==="add"?"active":""} aria-pressed={editAction==="add"} onClick={()=>chooseEditAction("add")}>＋ Добавить</button>
<button className={editAction==="replace"?"active":""} aria-pressed={editAction==="replace"} onClick={()=>chooseEditAction("replace")}>↺ Заменить</button>
<button className={editAction==="remove"?"active":""} aria-pressed={editAction==="remove"} onClick={()=>chooseEditAction("remove")}>⌫ Удалить</button>{draft.length>0&&<button className="finish" onClick={finishDraft}>✓ Завершить линию</button>}</>}<button onClick={undo}>↶ Отменить</button>
<button onClick={clear}>Очистить</button>
<span>{activeTracks.length} треков · {activeFixtures.length} светильников</span>
</footer>
</section>
 <aside className="folio-right">
{selectedSceneProduct&&<section className="folio-selection-card">
<span>Выбранный предмет</span>
<div><img src={selectedSceneProduct.image} alt=""/><p>
<b>{selectedSceneProduct.name}</b>
<small>Арт. {selectedSceneProduct.article}</small>{selectedTrack&&<em>Длина: {lengthLabel(selectedTrack.lengthMm)}</em>}{selectedFixture?.trackId&&<em>Привязан к треку</em>}</p>
</div>
<footer>{selectedTrack&&<button onClick={rotate}>↻ Повернуть 90°</button>}<button onClick={remove}>⌫ Удалить</button>
</footer>{selectedTrack&&<div className="folio-rotation-control"><label>Угол трека<input type="number" min="0" max="359" value={selectedTrack.rotation} onChange={event=>setTrackRotation(Number(event.target.value))}/></label><input aria-label="Угол поворота трека" type="range" min="0" max="359" step="1" value={selectedTrack.rotation} onChange={event=>setTrackRotation(Number(event.target.value))}/><small>Дважды кликните по треку на плане и тяните круглый маркер, чтобы повернуть его мышью.</small></div>}
</section>}
<section>
<span className="folio-number">03</span>
<i/>
<h2>Состав проекта</h2>
<div className="folio-scene-list">{!tracks.length&&!fixtures.length?<p>Добавленные товары появятся здесь.</p>:<>{tracks.map(track=>
<button key={track.id} className={selection?.id===track.id?"active":""} onClick={()=>setSelection({kind:"track",id:track.id})}>
<b>━ {track.product.article}</b>
<small>{lengthLabel(track.lengthMm)}</small>
</button>)}{fixtures.map(fixture=>
<button key={fixture.id} className={selection?.id===fixture.id?"active":""} onClick={()=>setSelection({kind:"fixture",id:fixture.id})}>
<b>● {fixture.product.article}</b>
<small>{fixture.trackId?"на треке":"отдельно"}</small>
</button>)}</>}</div>
</section>{mode==="image"&&photo&&<section className="folio-image-actions">
<button className="upscale" type="button" onClick={()=>void upscalePhoto()} disabled={busy}>{upscaling?"Улучшаем качество…":"✦ Сделать апскейл"}</button>
<p>Апскейл повысит детализацию, сохранив композицию, предметы и свет.</p>
</section>}{history.length>0&&<section>
<span className="folio-number">04</span>
<i/>
<h2>История рендеров</h2>
<div className="folio-history">{history.map(item=>
<button key={item.id} onClick={()=>{setPhoto(item.image);setPhotoName(item.label);setImageProducts(item.products);setMode("image");setEditAction(null);setEditPoint(null)}}>
<img src={item.image} alt={item.label}/>
<span>{item.label}</span>
</button>)}</div>
</section>}{mode==="plan"&&<div className="folio-generate-wrap">
<button className="folio-generate" onClick={()=>void generate()} disabled={busy}>{busy?"Создаём визуализацию…":"Создать рендер →"}</button>{error&&<p role="alert">{error}</p>}<small>Результат не является светотехническим расчётом.</small>
</div>}
</aside>
 <section className="folio-catalog">
<header>
<span className="folio-number">04</span>
<div className="folio-brand-select">
<button className="folio-brand-trigger" type="button" aria-haspopup="menu" aria-expanded={brandMenuOpen} onClick={()=>setBrandMenuOpen(open=>!open)}><span>Выбор бренда</span><b>{brand==="all"?"Все бренды":brands.find(option=>option.id===brand)?.name||"Все бренды"}</b><i aria-hidden="true">⌄</i></button>
{brandMenuOpen&&<div className="folio-brand-menu" role="menu" aria-label="Выбор бренда">
<button type="button" role="menuitemradio" aria-checked={brand==="all"} onClick={()=>{setBrand("all");setBrandMenuOpen(false)}}><span>{brand==="all"?"✓":""}</span>Все бренды</button>
{brands.map(option=><button key={option.id} type="button" role="menuitemradio" aria-checked={brand===option.id} onClick={()=>{setBrand(option.id);setBrandMenuOpen(false)}}><span>{brand===option.id?"✓":""}</span>{option.name}</button>)}
</div>}
</div>
<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по названию или артикулу"/>
<nav>{(["track","track_fixture","fixture","power","accessory","all"] as const).map(type=>
<button key={type} className={catalogType===type?"active":""} onClick={()=>setCatalogType(type)}>{type==="all"?"Все категории":label(type)}</button>)}</nav>
<span>{total+visibleReferenceProducts.length} товаров</span>
</header>{catalogError&&<p className="folio-catalog-error">{catalogError}</p>}<div className="folio-products">{(catalogType==="track"||catalogType==="track_fixture"||catalogType==="fixture")&&<button className="folio-reference-upload" onClick={()=>{setReferenceUploadType(catalogType);referenceUpload.current?.click()}} aria-label={`Добавить ${catalogType==="track"?"трек":catalogType==="track_fixture"?"трековый светильник":"светильник"} из референса`}>
<span><strong>＋</strong></span>
<em>REF</em>
<b>Добавить из референса</b>
<small>Загрузите фотографию</small>
<small>Размеры укажете слева</small>
</button>}{visibleReferenceProducts.map(product=>
<button key={product.id} className={`${selectedProduct?.id===product.id?"selected ":""}${imageProductIds.has(product.id)?"used ":""}reference`} onClick={()=>addProduct(product)} aria-label={`Добавить ${product.name}`}>
<span><img src={product.image} alt=""/></span>
<em className={imageProductIds.has(product.id)?"used":""}>{imageProductIds.has(product.id)?"✓ В изображении":"REF"}</em>
<b>{product.name}</b>
<small>{product.type==="track"?"Трек":product.type==="track_fixture"?"Трековый светильник":"Светильник"} из референса</small>
<small>{product.specs.widthMm&&product.specs.lengthMm?`${product.specs.widthMm} × ${product.specs.lengthMm} мм`:"Укажите размеры"}</small>
</button>)}{loading?<p>Загружаем каталог…</p>:visibleCatalogProducts.map(product=>
<button key={product.id} className={`${selectedProduct?.id===product.id?"selected ":""}${imageProductIds.has(product.id)?"used":""}`} onClick={()=>addProduct(product)} aria-label={`${mode==="plan"&&["track","fixture","track_fixture"].includes(product.type)?"Добавить":"Выбрать"} ${product.name}`}>
<span>{product.image?<img src={product.image} alt=""/>:<i>{product.type==="track"?"━":"Нет фото"}</i>}</span>
<em className={imageProductIds.has(product.id)?"used":""}>{imageProductIds.has(product.id)?"✓ В изображении":"♡"}</em>
<b>{product.name}</b>
<small>Арт. {product.article}</small>
<small>{product.type==="track"&&product.specs.lengthMm?`Длина ${lengthLabel(product.specs.lengthMm)} · `:""}{money(product.price)}</small>
</button>)}</div>
<footer>{mode==="plan"?"Нажатие на трек или светильник сразу добавляет его на план в масштабе.":"Выберите товар, затем разметьте его положение на изображении."}</footer>
</section>
</section>
 {saveDialogOpen&&<div className="folio-save-backdrop" role="presentation" onPointerDown={()=>!savingProject&&setSaveDialogOpen(false)}><section className="folio-save-dialog" role="dialog" aria-modal="true" aria-labelledby="technical-save-title" onPointerDown={event=>event.stopPropagation()}>
<header><div><small>ТЕХНИЧЕСКИЙ СВЕТ</small><h2 id="technical-save-title">Сохранить проект</h2></div><button type="button" onClick={()=>setSaveDialogOpen(false)} aria-label="Закрыть">×</button></header>
<div className="folio-save-tabs"><button type="button" className={saveMode==="existing"?"active":""} onClick={()=>setSaveMode("existing")}>Добавить в существующий</button><button type="button" className={saveMode==="new"?"active":""} onClick={()=>setSaveMode("new")}>Создать новый</button></div>
{saveMode==="existing"?<label className="folio-save-field">Проект{projects.length?<select value={saveTargetId} onChange={event=>setSaveTargetId(event.target.value)}><option value="">Выберите проект</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}{project.project_type?` · ${project.project_type}`:""}</option>)}</select>:<span className="folio-no-projects">Существующих проектов пока нет. Переключитесь на «Создать новый».</span>}<small>План технического света добавится в проект и не удалит мебельную часть.</small></label>:<label className="folio-save-field">Название проекта<input value={newProjectName} onChange={event=>setNewProjectName(event.target.value)} maxLength={120}/><small>Будет создан новый проект с текущей планограммой и визуализацией.</small></label>}
<footer><button type="button" className="secondary" onClick={()=>setSaveDialogOpen(false)}>Отмена</button><button type="button" className="primary" disabled={savingProject||saveMode==="existing"&&!saveTargetId} onClick={()=>void chooseProjectAndSave()}>{savingProject?"Сохраняем…":"Сохранить"}</button></footer>
</section></div>}
 {previewOpen&&photo&&<div className="folio-lightbox" role="dialog" aria-modal="true" aria-label="Полноэкранный просмотр изображения" onPointerDown={()=>setPreviewOpen(false)}>
<div className="folio-lightbox-toolbar" onPointerDown={e=>e.stopPropagation()}>
<button type="button" onClick={()=>void downloadPhoto()}>↓ Скачать</button>
<button type="button" onClick={()=>setPreviewOpen(false)} aria-label="Закрыть полноэкранный просмотр">×</button>
</div>
<img src={photo} alt={photoName||"Созданный интерьер"} onPointerDown={e=>e.stopPropagation()}/>
</div>}
 <input ref={upload} className="folio-hidden-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void uploadPhoto(e.target.files?.[0])}/>
 <input ref={referenceUpload} className="folio-hidden-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{void uploadReferenceProduct(e.target.files?.[0]);e.currentTarget.value=""}}/>
</main>
}
