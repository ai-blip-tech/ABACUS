import React,{useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';

type Option = {value: string; label: string};
type Position = {left:number; width:number; top?:number; bottom?:number; maxHeight:number};

export function CabinetSelect({label,value,options,onChange}:{
 label:string;value:string;options:Option[];onChange:(value:string)=>void;
}){
 const menuId=useId();
 const trigger=useRef<HTMLButtonElement>(null);
 const list=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState<Position|null>(null);
 const [active,setActive]=useState(-1);
 const selected=options.findIndex(option=>option.value===value);
 const open=position!==null;

 function locate(){
  const element=trigger.current;
  if(!element)return;
  const rect=element.getBoundingClientRect();
  const view=element.ownerDocument.defaultView!;
  const width=Math.min(Math.max(rect.width,158),view.innerWidth-16);
  const below=view.innerHeight-rect.bottom-10;
  const above=rect.top-10;
  const flip=below<Math.min(200,34*options.length+10)&&above>below;
  setPosition({
   left:Math.max(8,Math.min(rect.left,view.innerWidth-width-8)),width,
   ...(flip?{bottom:view.innerHeight-rect.top+4}:{top:rect.bottom+4}),
   maxHeight:Math.min(280,Math.max(0,flip?above:below)),
  });
 }

 function choose(index:number){
  const option=options[index];
  if(!option)return;
  setPosition(null);
  setActive(-1);
  if(option.value!==value)onChange(option.value);
  trigger.current?.focus();
 }

 useEffect(()=>{
  if(!open){setActive(-1);return;}
  const document=trigger.current!.ownerDocument;
  const view=document.defaultView!;
  const outside=(event:PointerEvent)=>{
   const target=event.target as Node|null;
   if(target&&!trigger.current?.contains(target)&&!list.current?.contains(target))setPosition(null);
  };
  const reposition=(event:Event)=>{
   if(event.target instanceof Node&&list.current?.contains(event.target))return;
   locate();
  };
  document.addEventListener('pointerdown',outside,true);
  view.addEventListener('resize',reposition);
  view.addEventListener('scroll',reposition,true);
  return()=>{
   document.removeEventListener('pointerdown',outside,true);
   view.removeEventListener('resize',reposition);
   view.removeEventListener('scroll',reposition,true);
  };
 },[open,options.length]);

 useEffect(()=>{
  if(open&&active>=0)list.current?.children[active]?.scrollIntoView({block:'nearest'});
 },[active,open]);

 function keyDown(event:KeyboardEvent<HTMLButtonElement>){
  if(event.key==='Tab'){setPosition(null);return;}
  if(event.key==='Escape'&&open){
   event.preventDefault();event.stopPropagation();setPosition(null);return;
  }
  if(event.key==='Enter'||event.key===' '){
   event.preventDefault();
   if(open){choose(active>=0?active:Math.max(0,selected));return;}
   locate();setActive(Math.max(0,selected));return;
  }
  const direction=event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0;
  if(direction||event.key==='Home'||event.key==='End'){
   event.preventDefault();
   if(!open)locate();
   setActive(event.key==='Home'?0:event.key==='End'?options.length-1:
    Math.min(options.length-1,Math.max(0,active<0?selected+(open?direction:0):active+direction)));
   return;
  }
  if(event.key.length===1&&event.key.trim()&&!event.ctrlKey&&!event.metaKey&&!event.altKey){
   const prefix=event.key.toLocaleLowerCase();
   const match=options.findIndex(option=>option.label.toLocaleLowerCase().startsWith(prefix));
   if(match>=0){event.preventDefault();if(!open)locate();setActive(match);}
  }
 }

 const dialog=trigger.current?.closest('dialog');
 return <div className="rd-cabinet-select">
  <button type="button" ref={trigger} className="rd-cabinet-select-trigger" role="combobox"
   aria-label={label} aria-haspopup="listbox" aria-expanded={open}
   aria-controls={open?menuId:undefined} aria-activedescendant={open&&active>=0?menuId+'-'+active:undefined}
   disabled={!options.length}
   onClick={()=>{if(open)setPosition(null);else{setActive(-1);locate();}}} onKeyDown={keyDown}>
   <span>{options[selected]?.label??'—'}</span>
  </button>
  {position&&dialog&&createPortal(<div ref={list} id={menuId} className="rd-cabinet-select-menu"
   style={position} role="listbox" aria-label={label}>
   {options.map((option,index)=><div id={menuId+'-'+index} role="option" key={option.value}
    aria-label={option.label} aria-selected={index===selected} data-keyboard-active={index===active||undefined}
    onPointerMove={()=>{if(active>=0)setActive(-1);}}
    onMouseDown={event=>event.preventDefault()} onClick={()=>choose(index)}>{option.label}</div>)}
  </div>,dialog)}
 </div>;
}
