'use client';
import {useState} from 'react';
import {PlanogramWorkspace,PlanogramPanel} from './interior-planogram';
import type {InteriorWorkspace} from '@/lib/material-board/interior-workspace';

export default function InteriorWorkArea({value,onChange,onRender,onBindReference,busy}:{value:InteriorWorkspace;onChange:(value:InteriorWorkspace)=>void;onRender:(image:string,prompt:string,references:string[])=>void;onBindReference:(itemId:string,sourceId:string)=>void;busy:boolean}){
 const [selected,setSelected]=useState<string|null>(null);
 const patch=(next:Partial<InteriorWorkspace>)=>onChange({...value,...next});
 return <div className="sandbox-interior-workspace" tabIndex={0} onPointerDown={e=>{e.stopPropagation();if(!(e.target as HTMLElement).closest('input,textarea,button,[contenteditable=true]'))e.currentTarget.focus({preventScroll:true});}} onKeyDown={e=>{if(e.key==='Escape'&&!(e.target as HTMLElement).closest('input,textarea,[contenteditable=true]')){e.preventDefault();setSelected(null);}}}>
  <div className="sandbox-interior-main"><PlanogramWorkspace items={value.items} room={value.room} selectedId={selected} onSelect={setSelected} onChange={items=>patch({items})} onRoomChange={room=>patch({room})} floorReference={value.floorReference} wallReference={value.wallReference} onFloorReferenceChange={floorReference=>patch({floorReference})} onWallReferenceChange={wallReference=>patch({wallReference})} camera={null} onCameraChange={()=>{}} onCreateReference={onRender} onBindReference={onBindReference} isCreatingReference={busy}/></div>
  <aside className="sandbox-interior-settings" aria-label="Настройки создаваемого интерьера">
   <PlanogramPanel items={value.items} room={value.room} selectedId={selected} onSelect={setSelected} onChange={items=>patch({items})}/>
  </aside>
 </div>;
}
