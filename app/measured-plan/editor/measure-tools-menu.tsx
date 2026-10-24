import React,{useEffect,useRef,useState} from 'react';

export function MeasureToolsMenu({children,activeLabel}:{children:React.ReactNode;activeLabel:string}){
 const [open,setOpen]=useState(false);
 const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  if(!open)return;
  const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 return <div className="measure-tools-menu" ref={root} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
  <button ref={trigger} aria-expanded={open} aria-controls="measure-additional-tools" onClick={()=>setOpen(value=>!value)}>Дополнительные настройки <span aria-hidden="true">⌄</span></button>
  {open&&<div id="measure-additional-tools" className="measure-tools-popup" role="group" aria-label="Инструменты плана" onClick={event=>{if((event.target as Element).closest('button')){setOpen(false);trigger.current?.focus();}}}>{children}</div>}
  {activeLabel&&<span className="measure-current-tool" aria-live="polite">{activeLabel}</span>}
 </div>;
}
