'use client';

import {useState} from 'react';
import {planogramRoomDimensionMm} from '@/lib/planogram-geometry';

export function PlanogramRoomDimension({axis,value,onChange}:{
  axis:'width'|'length';
  value:number;
  onChange:(dimension:number)=>void;
}){
  const [draft,setDraft]=useState<string|null>(null);
  const text=draft??String(value);
  return <label className={`room-measure room-${axis}`}>
    <input aria-label={axis==='width'?'Ширина комнаты, мм':'Длина комнаты, мм'} inputMode="numeric"
      value={text} style={{width:`${Math.max(2,text.length)}ch`}}
      onFocus={event=>event.currentTarget.select()}
      onChange={event=>setDraft(event.currentTarget.value)}
      onBlur={event=>{
        const next=Number(event.currentTarget.value.trim());
        setDraft(null);
        if(Number.isFinite(next)&&next>0&&next!==value)onChange(planogramRoomDimensionMm(next));
      }}
      onKeyDown={event=>{
        if(event.key!=='Enter'&&event.key!=='Escape')return;
        event.preventDefault();
        event.stopPropagation();
        if(event.key==='Escape')event.currentTarget.value=String(value);
        event.currentTarget.blur();
      }}/>
    <span>мм</span>
  </label>;
}
