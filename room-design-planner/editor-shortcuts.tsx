import {useEffect} from 'react';
import {useScene,runAsSingleSceneHistoryStep} from '@pascal-app/core';
import {useViewer} from '@pascal-app/viewer';
import {runUndo,runRedo,useEditor} from '@pascal-app/editor';
// Version-pinned adapter: use Pascal's graph/material clipboard, without click-to-carry.
import {copySelectedNodesToEditorClipboard,pasteEditorClipboardToLevel,getEditorClipboardSnapshot} from './node_modules/@pascal-app/editor/src/lib/scene-clipboard';
import {editorKeyCommand,type EditorKeyCommand} from '../lib/planning-plan/key-command.ts';
export function EditorShortcuts(){useEffect(()=>{
 const editable=(target:any)=>target?.closest?.('input,textarea,select,[contenteditable="true"],dialog,[role="dialog"]');
 const cancel=()=>{window.dispatchEvent(new CustomEvent('roomdesign:cancel-item-gesture'));window.dispatchEvent(new CustomEvent('roomdesign:item-interaction',{detail:{type:'cancel'}}));};
 const clear=()=>{useViewer.getState().setSelection({selectedIds:[],zoneId:null});useViewer.setState({hoveredId:null});useEditor.getState().clearRoom();};
 const tileCommand=(command:string,clipboardText?:string)=>{const event=new CustomEvent('roomdesign:tile-editor-command',{cancelable:true,detail:{command,clipboardText}});window.dispatchEvent(event);return event;};
 const run=(command:EditorKeyCommand)=>{const tile=tileCommand(command);if(tile.defaultPrevented)return;const selected=useViewer.getState().selection.selectedIds.filter(id=>{const node=useScene.getState().nodes[id as any];return node&&!['site','building','level'].includes(node.type);}) as any[];
  if(command==='copy'){copySelectedNodesToEditorClipboard(selected);return;}
  cancel();
  if(command==='clear'){clear();return;}
  if(command==='undo'||command==='redo'){if(command==='undo')runUndo();else runRedo();clear();return;}
  if(command==='delete'||command==='cut'){if(!selected.length)return;if(command==='cut'&&!copySelectedNodesToEditorClipboard(selected))return;runAsSingleSceneHistoryStep(useScene,()=>useScene.getState().deleteNodes(selected));clear();return;}
  if(command==='paste')runAsSingleSceneHistoryStep(useScene,()=>{const result=pasteEditorClipboardToLevel('level_roomdesign' as any);if(!result)return;const nodes=useScene.getState().nodes;useScene.getState().updateNodes(result.pastedIds.flatMap(id=>{const node:any=nodes[id];return node?.type==='item'?[{id,data:{position:[node.position[0]+.2,node.position[1],node.position[2]+.2]}}]:[]}) as any);});
 };
 const key=(event:KeyboardEvent)=>{if(editable(event.target))return;const command=editorKeyCommand(event);if(!command)return;event.preventDefault();event.stopImmediatePropagation();run(command);};
 const clipboard=(event:ClipboardEvent)=>{if(editable(event.target))return;const command=event.type as 'copy'|'cut'|'paste';const tile=tileCommand(command,event.clipboardData?.getData('text/plain'));if(tile.defaultPrevented){event.preventDefault();event.stopImmediatePropagation();if(command!=='paste'&&(tile.detail as any).clipboardText)event.clipboardData?.setData('text/plain',(tile.detail as any).clipboardText);return;}if(command==='paste'){const text=event.clipboardData?.getData('text/plain')||'';if(!text.startsWith('ROOM_DESIGN_PASCAL_V1\n')&&!text.includes('pascal.scene-nodes'))return;}else if(!useViewer.getState().selection.selectedIds.length)return;event.preventDefault();event.stopImmediatePropagation();run(command);if(command!=='paste'){const payload=getEditorClipboardSnapshot();if(payload)event.clipboardData?.setData('text/plain','ROOM_DESIGN_PASCAL_V1\n'+JSON.stringify(payload));}};
 const remote=(event:any)=>{if(['delete','clear','copy','paste','cut','undo','redo'].includes(event.detail?.command))run(event.detail.command);};
 window.addEventListener('keydown',key,true);for(const type of ['copy','cut','paste'])window.addEventListener(type,clipboard as EventListener,true);window.addEventListener('roomdesign:editor-command',remote);return()=>{for(const type of ['copy','cut','paste'])window.removeEventListener(type,clipboard as EventListener,true);window.removeEventListener('keydown',key,true);window.removeEventListener('roomdesign:editor-command',remote);};
 },[]);return null;}
