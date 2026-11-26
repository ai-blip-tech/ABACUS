import React,{useEffect,useId,useRef,useState} from 'react';
import {cabinetEuroCents,cabinetRubles,type CabinetEuroRate} from './cabinet-currency';
import type {CabinetSpecification} from './cabinet-specification';

function FavoritePhoto({photo}:{photo:Blob}){
 const [url,setUrl]=useState<string>();
 useEffect(()=>{
  const source=URL.createObjectURL(photo);
  setUrl(source);
  return()=>URL.revokeObjectURL(source);
 },[photo]);
 return <img src={url} alt="" loading="lazy"/>;
}

export function CabinetFavorites({items,rate,busy,onRemove}:{
 items:CabinetSpecification[]|null;
 rate:CabinetEuroRate|null;
 busy:boolean;
 onRemove:(item:CabinetSpecification)=>Promise<void>;
}){
 const [open,setOpen]=useState(false);
 const [error,setError]=useState('');
 const panelId=useId();
 const root=useRef<HTMLDivElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const list=useRef<HTMLUListElement>(null);
 const nextFocus=useRef<number|null>(null);

 useEffect(()=>{
  if(!open)return;
  const closeOutside=(event:PointerEvent)=>{
   if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(false);
  };
  document.addEventListener('pointerdown',closeOutside,true);
  return()=>document.removeEventListener('pointerdown',closeOutside,true);
 },[open]);

 useEffect(()=>{
  if(!open||nextFocus.current===null||!items)return;
  const index=Math.min(nextFocus.current,items.length-1);
  const nextButton=list.current?.querySelectorAll('button')[index];
  (nextButton||trigger.current)?.focus();
  nextFocus.current=null;
 },[items,open]);

 async function remove(item:CabinetSpecification,index:number){
  if(busy)return;
  setError('');
  nextFocus.current=index;
  try{
   await onRemove(item);
  }catch{
   nextFocus.current=null;
   setError('Не удалось удалить товар из избранного. Попробуйте ещё раз.');
  }
 }

 return <div className="rd-cabinet-favorites" ref={root}
  onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}
  onKeyDown={event=>{
   if(event.key!=='Escape'||!open)return;
   event.preventDefault();
   event.stopPropagation();
   setOpen(false);
   trigger.current?.focus();
  }}>
  <button type="button" ref={trigger} className="rd-cabinet-favorites-trigger"
   disabled={!items} aria-expanded={open} aria-controls={open?panelId:undefined}
   onClick={()=>{
    nextFocus.current=null;
    setError('');
    setOpen(!open);
    trigger.current?.focus();
   }}>Избранное</button>
  {open&&items&&<div id={panelId} className="rd-cabinet-favorites-panel" role="region" aria-label="Сохранённые товары">
   {error&&<p role="alert">{error}</p>}
   {items.length>0?<ul ref={list}>
    {items.map((item,index)=>{
     const rubles=cabinetRubles(cabinetEuroCents(item.price,item.priceInCents),rate);
     return <li key={item.fingerprint}>
     <FavoritePhoto photo={item.photos.front}/>
     <div className="rd-cabinet-favorites-item">
      <strong>{item.name}</strong>
      <span>{item.modules.map(module=>module.article).join(' + ')}</span>
      <b>{rubles||item.price}</b>
      {rubles&&<span>{item.price}</span>}
     </div>
     <button type="button" className="rd-cabinet-favorites-remove" aria-disabled={busy}
      aria-label={'Удалить из избранного: '+item.name+' '+(index+1)}
      onClick={()=>void remove(item,index)}>Удалить</button>
    </li>})}
   </ul>:<p>Нажмите на сердечко, чтобы добавить товар.</p>}
  </div>}
 </div>;
}
