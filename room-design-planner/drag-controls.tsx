import {useEffect} from 'react';
import {useScene} from '@pascal-app/core';
import {useViewer} from '@pascal-app/viewer';
import {useEditor} from '@pascal-app/editor';
import {constrainMove,constrainRotation,furnitureWalls} from './wall-collision.mjs';

export function DragControls({keyboard=true}:{keyboard?:boolean}={}){useEffect(()=>{
 let suppressClick=false,suppressPointerUp=false,rotation:any=null;
 const selected=()=>{const id=useViewer.getState().selection.selectedIds[0];const n=useScene.getState().nodes[id] as any;return n?.type==='item'&&!n.asset.attachTo&&!n.metadata?.column?n:null;};
 const notify=()=>window.dispatchEvent(new CustomEvent('roomdesign:rotation-mode',{detail:{id:rotation?.id||null}}));
 const finish=(revert=false)=>{if(revert&&rotation){const n=useScene.getState().nodes[rotation.id] as any;if(n)useScene.getState().updateNode(n.id,{rotation:rotation.original});}rotation=null;notify();};
 const move=(n:any,position:number[])=>{const safe=constrainMove(n,position,furnitureWalls(n,useScene.getState().nodes));console.debug('RD movement',JSON.stringify({id:n.id,from:n.position,requested:position,actual:safe}));useScene.getState().updateNode(n.id,{position:safe} as any);};
 const rotate=(n:any,angle:number)=>{const safe=constrainRotation(n,angle,furnitureWalls(n,useScene.getState().nodes));console.debug('RD rotation',JSON.stringify({id:n.id,requested:angle,actual:safe[1]}));useScene.getState().updateNode(n.id,{rotation:safe} as any);};
 const cancel=()=>{const editor=useEditor.getState();editor.setMovingNode(null);editor.setPlacementDragMode(false);useViewer.getState().setInputDragging(false);};
 const clear=()=>{finish();cancel();useViewer.getState().setSelection({selectedIds:[],zoneId:null});};
 cancel();
 const bridge=(event:Event)=>{const d=(event as CustomEvent).detail;
  if(d.type==='select'||d.type==='menu'){if(rotation&&rotation.id!==d.id)finish();suppressClick=true;useEditor.getState().clearRoom();useViewer.getState().setSelection({selectedIds:[d.id]});}
  else if(d.type==='cancel'){finish(true);cancel();}
  else if(d.type==='hover')useViewer.setState({hoveredId:d.id});
  else if(d.type==='move'){const n=useScene.getState().nodes[d.id] as any;if(n)move(n,d.position);}
  else if(d.type==='dragging')useViewer.getState().setInputDragging(d.value);
  else if(d.type==='rotation-toggle'){
   if(rotation?.id===d.id){finish();return;}
   const n=useScene.getState().nodes[d.id] as any;if(!n)return;
   useEditor.getState().clearRoom();useViewer.getState().setSelection({selectedIds:[d.id]});
   cancel();rotation={id:d.id,x:d.x,base:n.rotation[1],original:[...n.rotation]};notify();
  }
 };window.addEventListener('roomdesign:item-interaction',bridge);
 const editable=(target:EventTarget|null)=>target instanceof HTMLElement&&!!target.closest('input,textarea,select,[contenteditable="true"]');
 const key=(e:KeyboardEvent)=>{
  if(!keyboard||editable(e.target)||e.metaKey||e.ctrlKey||e.altKey)return;
  if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(rotation)finish(true);else clear();return;}
  if(rotation&&e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();finish();return;}
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
  const n=selected();if(!n)return;e.preventDefault();e.stopImmediatePropagation();
  if(rotation){if(e.key==='ArrowLeft'||e.key==='ArrowRight')rotate(n,n.rotation[1]+(e.key==='ArrowLeft'?-1:1)*Math.PI/18);rotation.base=(useScene.getState().nodes[n.id] as any).rotation[1];rotation.x=null;}
  else {const p=[...n.position];if(e.key==='ArrowLeft')p[0]-=.1;if(e.key==='ArrowRight')p[0]+=.1;if(e.key==='ArrowUp')p[2]-=.1;if(e.key==='ArrowDown')p[2]+=.1;move(n,p);}
 };
 const pointerMove=(e:PointerEvent)=>{if(!rotation||!(e.target instanceof HTMLCanvasElement))return;e.preventDefault();e.stopImmediatePropagation();const n=useScene.getState().nodes[rotation.id] as any;if(!n){finish();return;}if(rotation.x===null){rotation.x=e.clientX;rotation.base=n.rotation[1];}rotate(n,rotation.base+(e.clientX-rotation.x)*Math.PI/360);};
 const down=(e:PointerEvent)=>{suppressClick=false;if(!(e.target instanceof HTMLCanvasElement))return;e.target.tabIndex=0;e.target.focus({preventScroll:true});if(rotation&&e.button===0){finish();suppressClick=true;suppressPointerUp=true;e.preventDefault();e.stopImmediatePropagation();return;}if(e.button!==0)return;const id=useViewer.getState().hoveredId;if(!id||useScene.getState().nodes[id]?.type==='slab')clear();};
 const up=(e:PointerEvent)=>{if(suppressPointerUp){suppressPointerUp=false;e.preventDefault();e.stopImmediatePropagation();}};
 const click=(e:MouseEvent)=>{if(suppressClick&&e.target instanceof HTMLCanvasElement){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}};
 const blur=()=>{finish();cancel();};
 window.addEventListener('click',click,true);window.addEventListener('keydown',key,true);window.addEventListener('blur',blur);window.addEventListener('pointerdown',down,true);window.addEventListener('pointermove',pointerMove,true);window.addEventListener('pointerup',up,true);
 const unsub=useViewer.subscribe((s,p)=>{if(rotation&&s.selection.selectedIds[0]!==rotation.id)finish();});
 return()=>{unsub();finish();window.removeEventListener('click',click,true);window.removeEventListener('roomdesign:item-interaction',bridge);window.removeEventListener('keydown',key,true);window.removeEventListener('blur',blur);window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointermove',pointerMove,true);window.removeEventListener('pointerup',up,true);};
 },[keyboard]);return null;}
