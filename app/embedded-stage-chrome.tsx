'use client';
import {useEffect} from 'react';
import './project-stage-workspace.css';
export default function EmbeddedStageChrome(){
 useEffect(()=>{
  if(window.self===window.top||new URLSearchParams(location.search).get('embeddedStage')!=='1')return;
  document.documentElement.dataset.projectStageEmbed='true';
  // React is mounted: do not wait for every image, font or video to finish loading.
  window.parent.postMessage({type:'roomdesign:stage-ready'},location.origin);
  return()=>{delete document.documentElement.dataset.projectStageEmbed;};
 },[]);
 return null;
}
