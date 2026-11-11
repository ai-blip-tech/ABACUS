'use client';
import {useState} from 'react';
import {PlanogramWorkspace,PlanogramPanel} from './interior-planogram';
import type {InteriorWorkspace} from '@/lib/material-board/interior-workspace';

export default function InteriorWorkArea({value,onChange,onRender,onBindReference,busy}:{value:InteriorWorkspace;onChange:(value:InteriorWorkspace)=>void;onRender:(image:string,prompt:string,references:string[])=>void;onBindReference:(itemId:string,sourceId:string)=>void;busy:boolean}){
 const [selected,setSelected]=useState<string|null>(null);
 const patch=(next:Partial<InteriorWorkspace>)=>onChange({...value,...next});
 return <div className="sandbox-interior-workspace" tabIndex={0} onPointerDown={e=>{e.stopPropagation();if(!(e.target as HTMLElement).closest('input,textarea,button,[contenteditable=true]'))e.currentTarget.focus({preventScroll:true});}} onKeyDown={e=>{if(e.key==='Escape'&&!(e.target as HTMLElement).closest('input,textarea,[contenteditable=true]')){e.preventDefault();setSelected(null);}}}>
  <div className="sandbox-interior-main"><PlanogramWorkspace items={value.items} room={value.room} selectedId={selected} onSelect={setSelected} onChange={items=>patch({items})} onRoomChange={room=>patch({room})} floorReference={value.floorReference} wallReference={value.wallReference} onFloorReferenceChange={floorReference=>patch({floorReference})} onWallReferenceChange={wallReference=>patch({wallReference})} camera={value.camera} onCameraChange={camera=>patch({camera})} onCreateReference={onRender} onBindReference={onBindReference} isCreatingReference={busy}/></div>
  <aside className="sandbox-interior-settings" aria-label="Настройки создаваемого интерьера">
   <label>Размеры комнаты, мм<span className="sandbox-room-fields"><input aria-label="Ширина комнаты" type="number" min="100" max="100000" value={value.room.width} onChange={e=>{const n=Number(e.target.value);if(n>=100&&n<=100000)patch({room:{...value.room,width:n}});}}/><span>×</span><input aria-label="Длина комнаты" type="number" min="100" max="100000" value={value.room.length} onChange={e=>{const n=Number(e.target.value);if(n>=100&&n<=100000)patch({room:{...value.room,length:n}});}}/></span></label>
   <label>Что добавить или изменить?<textarea aria-label="Промпт создаваемого интерьера" value={value.instruction} onChange={e=>patch({instruction:e.target.value})} placeholder="Стиль, материалы, освещение…"/></label>
   {(['floor','wall'] as const).map(kind=>{const reference=kind==='floor'?value.floorReference:value.wallReference;return <label className="sandbox-surface-upload" key={kind}>{reference?<img src={reference.image} alt=""/>:null}<span>{reference?'Заменить':'Добавить'} референс {kind==='floor'?'пола':'стен'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const {blobImage}=await import('@/lib/material-board/generation');const reference={name:file.name,image:await blobImage(file)};patch(kind==='floor'?{floorReference:reference}:{wallReference:reference});}}/></label>})}
   <PlanogramPanel items={value.items} room={value.room} selectedId={selected} onSelect={setSelected} onChange={items=>patch({items})}/>
  </aside>
 </div>;
}
