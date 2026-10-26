import React,{useEffect,useRef,useState} from 'react';
import type {Point,Wall} from '@/lib/measured-plan/measure-model';
import {drawingLengthPoint,snapDrawingPoint,type DrawingSnap} from '@/lib/measured-plan/measure-wall-drawing';

export function MeasureWallDrawing({walls,view,font,zoom,pointOf,onCommit,onFinish}:{walls:Wall[];view:number[];font:number;zoom:number;pointOf:(e:React.PointerEvent)=>Point;onCommit:(a:Point,b:Point,thickness:number)=>void;onFinish:()=>void}){
 const [start,setStart]=useState<Point|null>(null),[first,setFirst]=useState<Point|null>(null),[hover,setHover]=useState<DrawingSnap|null>(null);
 const [typed,setTyped]=useState(''),[error,setError]=useState(''),[thickness,setThickness]=useState(100);
 const input=useRef<HTMLInputElement>(null);
 const unit=font/zoom,extent=Math.max(view[2],view[3])*10;
 const end=hover?.point;
 function commit(b:Point,exact=false){
  if(!start){setStart(b);setFirst(b);return;}
  if(Math.hypot(b[0]-start[0],b[1]-start[1])<100){setError('Минимальная длина стены — 100 мм');return;}
  // Each click is one independent undo step; preview and guides never enter the document.
  onCommit(start,b,thickness);setTyped('');setError('');
  if(!exact&&first&&walls.length&&Math.hypot(first[0]-b[0],first[1]-b[1])<.01){setStart(null);setFirst(null);setHover(null);}
  else{setStart(b);setHover({point:b,guides:[],label:''});}
 }
 function submit(){if(!start||!end)return;try{commit(drawingLengthPoint(start,end,Number(typed)),true);}catch(e){setError((e as Error).message);}}
 useEffect(()=>{const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){e.preventDefault();onFinish();return;}
  if((e.target as Element).closest('input,textarea,select,[contenteditable="true"]'))return;
  if(start&&/^\d$/.test(e.key)){e.preventDefault();setTyped(e.key);input.current?.focus();}
 };window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);});
 return <g data-wall-drawing>
  <rect data-wall-drawing-surface x={view[0]-extent} y={view[1]-extent} width={extent*2} height={extent*2} fill="transparent" style={{cursor:'crosshair',touchAction:'none'}}
   onPointerMove={e=>{e.stopPropagation();if(document.activeElement===input.current)return;setHover(snapDrawingPoint(pointOf(e),start,walls,unit*1.2,e.altKey));}}
   onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();input.current?.blur();const snap=snapDrawingPoint(pointOf(e),start,walls,unit*1.2,e.altKey);setHover(snap);commit(snap.point);}}
   onClick={e=>e.stopPropagation()}/>
  {hover&&<g pointerEvents="none">
   {/* Crosshair axes through the active point; highlighted guides extend existing geometry. */}
   <path d={`M ${end![0]-extent} ${end![1]} H ${end![0]+extent} M ${end![0]} ${end![1]-extent} V ${end![1]+extent}`} stroke="#998e80" strokeWidth=".8" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" opacity=".65"/>
   {hover.guides.map(g=><line key={g.axis} data-drawing-guide={g.axis} x1={g.axis==='x'?g.value:g.source[0]} y1={g.axis==='y'?g.value:g.source[1]} x2={end![0]} y2={end![1]} stroke="#25866b" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
   {start&&<line data-wall-preview x1={start[0]} y1={start[1]} x2={end![0]} y2={end![1]} stroke="#842b39" strokeWidth={thickness} opacity=".65"/>}
   {[...(start?[start]:[]),end!].map((p,i)=><path key={i} d={`M ${p[0]-unit*.45} ${p[1]} h ${unit*.9} M ${p[0]} ${p[1]-unit*.65} v ${unit*1.3}`} stroke={hover.label?'#25866b':'#842b39'} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/>)}
   <text x={end![0]+unit*1.2} y={end![1]-unit*2} fontSize={unit} fill="#206d57" stroke="#fffdf7" strokeWidth={unit*.35} paintOrder="stroke">{hover.label}</text>
  </g>}
  {start&&end&&Math.hypot(end[0]-start[0],end[1]-start[1])>=1&&<foreignObject x={(start[0]+end[0])/2+unit} y={(start[1]+end[1])/2-unit*7} width={unit*20} height={unit*6} style={{pointerEvents:'none'}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
   <form style={{fontSize:unit,display:'flex',alignItems:'start',gap:unit*.3,flexWrap:'wrap'}} onSubmit={e=>{e.preventDefault();submit();}}>
    <input ref={input} aria-label="Длина строящейся стены, мм" inputMode="numeric" value={typed} placeholder={String(Math.round(Math.hypot(end[0]-start[0],end[1]-start[1])))} onChange={e=>setTyped(e.target.value)} style={{pointerEvents:'auto',width:unit*6,fontSize:unit,padding:unit*.3,border:'1px solid #842b39',borderRadius:unit*.3,background:'white',color:'#302a25'}}/>
    <span style={{background:'white',padding:unit*.3}}>мм</span><button type="submit" disabled={!typed} style={{pointerEvents:'auto',fontSize:unit,padding:unit*.3}}>↵</button>
    <label style={{background:'white',padding:unit*.3}}>Толщина <input aria-label="Толщина строящейся стены, мм" type="number" min="50" max="1500" value={thickness} onChange={e=>{const n=Number(e.target.value);if(n>=50&&n<=1500)setThickness(n);}} style={{pointerEvents:'auto',width:unit*4,fontSize:unit}}/> мм</label>
    {error&&<span role="alert" style={{color:'#842b39',background:'white'}}>{error}</span>}
   </form>
  </foreignObject>}
 </g>;
}
