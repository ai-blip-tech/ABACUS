'use client';
import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import FurnitureCatalogPage from '../furniture-catalog-page';
import type {FurnitureItem,FurnitureKind} from '@/lib/planning-plan/furniture';
import {catalogProductKind,furnitureFromCatalog,furnitureCatalogType} from '@/lib/planning-plan/furniture-sidebar';

/** The full partner catalog from Image Editor, in the native top layer (also in fullscreen). */
export function PlanningFurnitureDialog({projectName,initialKind,initialItem,selectedIds,onClose,onAdd,replacing=false}:{projectName:string;initialKind:FurnitureKind;initialItem?:FurnitureItem;selectedIds:string[];onClose:()=>void;onAdd:(item:FurnitureItem)=>void;replacing?:boolean}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const d=ref.current;if(!d)return;d.showModal();return()=>d.close();},[]);
 const category=furnitureCatalogType(initialItem||{kind:initialKind,name:''});
 return createPortal(<dialog ref={ref} className="planning-full-catalog" aria-label="Каталог брендов партнеров" onCancel={e=>e.preventDefault()}>
  <FurnitureCatalogPage projectName={projectName} roomName="Планировочное решение" initialCategory={category} selectedIds={selectedIds} onClose={onClose} onSelect={(p,type)=>onAdd(furnitureFromCatalog(p,replacing?initialKind:catalogProductKind(p,type)||initialKind,type))}/>
 </dialog>,document.body);
}
