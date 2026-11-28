import React, {useEffect,useRef,useState,type ReactNode} from 'react';

export function CabinetCompositionModule({selected,disabled,onSelect,onRemove,children}:{
 selected:boolean;
 disabled:boolean;
 onSelect:()=>void;
 onRemove:()=>void;
 children:ReactNode;
}){
 const [showRemove,setShowRemove]=useState(false);
 const root=useRef<HTMLDivElement>(null);
 const card=useRef<HTMLButtonElement>(null);
 const press=useRef<{timeout:number;pointerId:number;x:number;y:number}|null>(null);

 function cancelPress(){
  if(!press.current)return;
  clearTimeout(press.current.timeout);
  press.current=null;
 }

 useEffect(()=>{
  if(!selected||disabled)setShowRemove(false);
  return cancelPress;
 },[selected,disabled]);

 useEffect(()=>{
  if(!showRemove)return;
  const closeOutside=(event:PointerEvent)=>{
   if(event.target instanceof Node&&!root.current?.contains(event.target))setShowRemove(false);
  };
  document.addEventListener('pointerdown',closeOutside,true);
  return()=>document.removeEventListener('pointerdown',closeOutside,true);
 },[showRemove]);

 return <div className="rd-cabinet-composition-module" ref={root} onKeyDown={event=>{
  if(event.key!=='Escape'||!showRemove)return;
  event.preventDefault();
  event.stopPropagation();
  setShowRemove(false);
  card.current?.focus();
 }}>
  <button type="button" ref={card} className="rd-cabinet-composition-card" aria-pressed={selected} disabled={disabled}
   onClick={onSelect}
   onPointerDown={event=>{
    if(!selected||!event.isPrimary||event.button!==0)return;
    cancelPress();
    const timeout=window.setTimeout(()=>{
     press.current=null;
     setShowRemove(true);
    },500);
    press.current={timeout,pointerId:event.pointerId,x:event.clientX,y:event.clientY};
   }}
   onPointerMove={event=>{
    const start=press.current;
    if(start?.pointerId===event.pointerId&&Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)cancelPress();
   }}
   onPointerUp={cancelPress}
   onPointerCancel={cancelPress}
   onPointerLeave={cancelPress}
   onContextMenu={event=>{
    event.preventDefault();
    cancelPress();
    if(selected)setShowRemove(true);
   }}>
   {children}
  </button>
  <button type="button" className="rd-cabinet-remove-module" data-revealed={selected&&showRemove}
   aria-label="Удалить модуль" disabled={disabled} onClick={onRemove}>
   <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
    <path d="m4 4 8 8m0-8-8 8"/>
   </svg>
   <span>Удалить модуль</span>
  </button>
 </div>;
}
