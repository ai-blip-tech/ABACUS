import {useEffect,useRef} from 'react';
import type {Point} from '@/lib/measured-plan/measure-model';

export type InlineDimensionEdit={kind:'wall-clear'|'opening-start'|'opening-width'|'opening-end'|'opening-nearest';id:string;value:number;at:Point};
export function InlineDimensionEditor({edit,font,onApply,onCancel}:{edit:InlineDimensionEdit;font:number;onApply:(value:number)=>void;onCancel:()=>void}){
 const input=useRef<HTMLInputElement>(null);useEffect(()=>{input.current?.focus();input.current?.select();},[]);
 const width=Math.max(font*7,620),height=Math.max(font*2.8,230);
 return <foreignObject x={edit.at[0]-width/2} y={edit.at[1]-height/2} width={width} height={height} data-inline-dimension-editor>
  <form className="inline-dimension-form" onSubmit={event=>{event.preventDefault();const value=Number(new FormData(event.currentTarget).get('value'));if(Number.isFinite(value))onApply(value);}}>
   <input ref={input} name="value" type="number" min="0" max="50000" step="1" defaultValue={Math.round(edit.value)} aria-label="Новое значение размера, мм" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();onCancel();}}}/><span>мм</span>
  </form>
 </foreignObject>;
}
