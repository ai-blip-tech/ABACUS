'use client';

import {useEffect,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';

type SavedColour={id:string;name:string;hex:string};
type RGB={r:number;g:number;b:number};
type HSV={h:number;s:number;v:number};

const STORAGE_KEY='room-design-custom-colours-v1';
const starterColours:SavedColour[]=[
 {id:'graphite',name:'Графитовый',hex:'#343633'},
 {id:'warm-grey',name:'Тёплый серый',hex:'#8B8378'},
 {id:'sand',name:'Песочный',hex:'#C9B18E'},
 {id:'clay',name:'Глиняный',hex:'#A86650'},
 {id:'wine',name:'Винный',hex:'#6B2F3B'},
 {id:'olive',name:'Оливковый',hex:'#66705A'},
 {id:'forest',name:'Лесной',hex:'#32483C'},
 {id:'deep-blue',name:'Глубокий синий',hex:'#384D61'},
 {id:'cream',name:'Сливочный',hex:'#ECE3D2'},
 {id:'white',name:'Мягкий белый',hex:'#F4F1EA'},
];

const clamp=(value:number,min=0,max=255)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));
function normalizeHex(value:string){const clean=value.trim().replace(/^#/,'');if(/^[0-9a-f]{3}$/i.test(clean))return '#'+clean.split('').map(x=>x+x).join('').toUpperCase();if(/^[0-9a-f]{6}$/i.test(clean))return '#'+clean.toUpperCase();return null;}
function hexToRgb(hex:string):RGB{const value=parseInt(hex.slice(1),16);return{r:(value>>16)&255,g:(value>>8)&255,b:value&255};}
function rgbToHex({r,g,b}:RGB){return '#'+[r,g,b].map(value=>Math.round(clamp(value)).toString(16).padStart(2,'0')).join('').toUpperCase();}
function rgbToHsv({r,g,b}:RGB):HSV{const rr=r/255,gg=g/255,bb=b/255,max=Math.max(rr,gg,bb),min=Math.min(rr,gg,bb),delta=max-min;let h=0;if(delta){if(max===rr)h=60*(((gg-bb)/delta)%6);else if(max===gg)h=60*((bb-rr)/delta+2);else h=60*((rr-gg)/delta+4);}if(h<0)h+=360;return{h:Math.round(h),s:max===0?0:Math.round(delta/max*100),v:Math.round(max*100)};}
function hsvToRgb({h,s,v}:HSV):RGB{const hue=((h%360)+360)%360,sat=clamp(s,0,100)/100,value=clamp(v,0,100)/100,c=value*sat,x=c*(1-Math.abs((hue/60)%2-1)),m=value-c;let values:[number,number,number]=[0,0,0];if(hue<60)values=[c,x,0];else if(hue<120)values=[x,c,0];else if(hue<180)values=[0,c,x];else if(hue<240)values=[0,x,c];else if(hue<300)values=[x,0,c];else values=[c,0,x];return{r:(values[0]+m)*255,g:(values[1]+m)*255,b:(values[2]+m)*255};}
function colourName(hex:string){const {h,s,v}=rgbToHsv(hexToRgb(hex));if(v<=12)return'Чёрный';if(s<=8){if(v>=94)return'Белый';if(v>=76)return'Светло-серый';if(v>=45)return'Серый';return'Тёмно-серый';}let base='Красный';if(h>=15&&h<40)base='Оранжевый';else if(h>=40&&h<65)base='Жёлтый';else if(h>=65&&h<90)base='Салатовый';else if(h>=90&&h<165)base='Зелёный';else if(h>=165&&h<195)base='Бирюзовый';else if(h>=195&&h<255)base='Синий';else if(h>=255&&h<290)base='Фиолетовый';else if(h>=290&&h<335)base='Розовый';if(v<38)return'Тёмно-'+base.toLowerCase();if(v>86&&s<55)return'Светло-'+base.toLowerCase();return base;}

export default function ColorPaletteContent({onAdd}:{onAdd:(colour:{title:string;colour:string})=>void}){
 const [hex,setHex]=useState('#8B8378'),[hexDraft,setHexDraft]=useState('#8B8378'),[name,setName]=useState('Тёплый серый'),[saved,setSaved]=useState<SavedColour[]>([]),[message,setMessage]=useState('');
 const hsv=rgbToHsv(hexToRgb(hex));
 useEffect(()=>{const timer=window.setTimeout(()=>{try{const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');if(Array.isArray(parsed))setSaved(parsed.filter(item=>item&&typeof item.name==='string'&&normalizeHex(item.hex)));}catch{/* Empty or invalid local palette. */}},0);return()=>window.clearTimeout(timer);},[]);
 function choose(value:string,label?:string){const normalized=normalizeHex(value);if(!normalized)return;setHex(normalized);setHexDraft(normalized);setName(label||colourName(normalized));setMessage('');}
 function setHsv(next:HSV){choose(rgbToHex(hsvToRgb(next)));}
 function updateSpectrum(event:ReactPointerEvent<HTMLDivElement>){const rect=event.currentTarget.getBoundingClientRect(),s=clamp((event.clientX-rect.left)/rect.width*100,0,100),v=clamp((1-(event.clientY-rect.top)/rect.height)*100,0,100);setHsv({h:hsv.h,s,v});}
 function spectrumDown(event:ReactPointerEvent<HTMLDivElement>){event.currentTarget.setPointerCapture(event.pointerId);updateSpectrum(event);}
 function spectrumMove(event:ReactPointerEvent<HTMLDivElement>){if(event.currentTarget.hasPointerCapture(event.pointerId))updateSpectrum(event);}
 function persist(next:SavedColour[]){setSaved(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));}
 function saveColour(){const title=name.trim()||`Цвет ${hex}`;persist([{id:crypto.randomUUID(),name:title,hex},...saved.filter(item=>item.hex!==hex)].slice(0,40));setMessage('Цвет сохранён в вашей палитре.');}
 return <div className="concept-colour-picker simple">
  <p className="concept-modal-intro">Выберите цвет визуально. HEX можно использовать, только если у вас уже есть точное экранное значение.</p>
  <div className="concept-colour-simple-editor">
   <section className="concept-colour-visual">
    <div className="concept-colour-spectrum" role="slider" aria-label="Яркость и насыщенность цвета" aria-valuenow={Math.round(hsv.s)} aria-valuetext={`${Math.round(hsv.s)}% насыщенности, ${Math.round(hsv.v)}% яркости`} tabIndex={0} style={{'--pure-hue':`hsl(${hsv.h} 100% 50%)`} as CSSProperties} onPointerDown={spectrumDown} onPointerMove={spectrumMove} onKeyDown={event=>{if(event.key==='ArrowLeft')setHsv({...hsv,s:clamp(hsv.s-2,0,100)});if(event.key==='ArrowRight')setHsv({...hsv,s:clamp(hsv.s+2,0,100)});if(event.key==='ArrowUp')setHsv({...hsv,v:clamp(hsv.v+2,0,100)});if(event.key==='ArrowDown')setHsv({...hsv,v:clamp(hsv.v-2,0,100)});}}><i style={{left:`${hsv.s}%`,top:`${100-hsv.v}%`,background:hex}}/></div>
    <label className="concept-colour-hue"><span>Оттенок</span><input type="range" min="0" max="359" value={hsv.h} aria-label="Выбрать оттенок" onChange={event=>setHsv({...hsv,h:Number(event.target.value)})}/></label>
   </section>
   <section className="concept-colour-summary">
    <div className="concept-colour-current" style={{background:hex}}><span>{name.trim()||'Без названия'}</span><small>{hex}</small></div>
    <label><span>Название цвета</span><input value={name} maxLength={70} onChange={event=>setName(event.target.value)} placeholder="Например, тёплый серый"/></label>
    <label><span>HEX <small>необязательно</small></span><input value={hexDraft} inputMode="text" onChange={event=>setHexDraft(event.target.value)} onBlur={()=>{const normalized=normalizeHex(hexDraft);if(normalized)choose(normalized);else setHexDraft(hex);}} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();const normalized=normalizeHex(hexDraft);if(normalized)choose(normalized);else setHexDraft(hex);}}}/></label>
    <div className="concept-colour-actions"><button type="button" onClick={saveColour}>Сохранить</button><button type="button" className="primary" onClick={()=>onAdd({title:name.trim()||`Цвет ${hex}`,colour:hex})}>Добавить на стол</button></div>
    {message&&<p className="concept-colour-message" role="status">{message}</p>}
   </section>
  </div>
  <section className="concept-colour-library"><header><div><small>ГОТОВАЯ ПОДБОРКА</small><b>Базовые интерьерные цвета</b></div></header><div>{starterColours.map(item=><button type="button" key={item.id} onClick={()=>choose(item.hex,item.name)} aria-label={`${item.name}, ${item.hex}`}><i style={{background:item.hex}}/><span>{item.name}<small>{item.hex}</small></span></button>)}</div></section>
  <section className="concept-colour-library saved"><header><div><small>МОЯ ПАЛИТРА</small><b>Сохранённые цвета</b></div><span>{saved.length}/40</span></header>{saved.length?<div>{saved.map(item=><div className="concept-colour-saved" key={item.id}><button type="button" onClick={()=>choose(item.hex,item.name)} aria-label={`${item.name}, ${item.hex}`}><i style={{background:item.hex}}/><span>{item.name}<small>{item.hex}</small></span></button><button type="button" className="concept-colour-remove" aria-label={'Удалить '+item.name} onClick={()=>persist(saved.filter(savedItem=>savedItem.id!==item.id))}>×</button></div>)}</div>:<p>Сохранённые цвета появятся здесь и останутся в этом браузере.</p>}</section>
 </div>;
}
