'use client';
import {useEffect,useState} from 'react';
import './workspace-fullscreen.css';
/** Expand just the canvas and its inspector, retaining the same live editor. */
export function WorkspaceFullscreenButton({target}:{target:string}){
 const [expanded,setExpanded]=useState(false);
 useEffect(()=>{const element=document.querySelector(target);if(!element)return;const changed=()=>{if(!document.fullscreenElement&&!element.classList.contains('workspace-fullscreen-fallback'))setExpanded(false);};const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&element.classList.contains('workspace-fullscreen-fallback')){element.classList.remove('workspace-fullscreen-fallback');setExpanded(false);}};document.addEventListener('fullscreenchange',changed);window.addEventListener('keydown',escape,true);return()=>{document.removeEventListener('fullscreenchange',changed);window.removeEventListener('keydown',escape,true);element.classList.remove('workspace-fullscreen-fallback');window.parent.postMessage({type:'roomdesign:stage-fullscreen',expanded:false},location.origin);};},[target]);
 useEffect(()=>{window.parent.postMessage({type:'roomdesign:stage-fullscreen',expanded},location.origin);},[expanded]);
 async function toggle(){const el=document.querySelector<HTMLElement>(target);if(!el)return;if(expanded){el.classList.remove('workspace-fullscreen-fallback');if(document.fullscreenElement)await document.exitFullscreen();setExpanded(false);return;}try{await el.requestFullscreen();}catch{el.classList.add('workspace-fullscreen-fallback');}setExpanded(true);}
 return <button className="workspace-fullscreen-button" aria-label={expanded?'Выйти из полноэкранного режима':'Открыть на весь экран'} title={expanded?'Выйти из полноэкранного режима':'Открыть на весь экран'} aria-pressed={expanded} onClick={()=>void toggle()}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">{expanded?<path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5"/>:<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>}</svg></button>;
}
