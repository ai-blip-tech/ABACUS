'use client';
import {useEffect} from 'react';
import './project-stage-workspace.css';
export default function EmbeddedStageChrome(){
 useEffect(()=>{
  if(window.self===window.top||new URLSearchParams(location.search).get('embeddedStage')!=='1')return;
  document.documentElement.dataset.projectStageEmbed='true';
  return()=>{delete document.documentElement.dataset.projectStageEmbed;};
 },[]);
 return null;
}
