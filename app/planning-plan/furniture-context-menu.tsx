'use client';
import {useState} from 'react';
import {type FurnitureItem,type FurnitureKind} from '@/lib/planning-plan/furniture';
import {needsFurnitureTypeReview,confirmFurnitureType,furnitureTypeChoices} from '@/lib/planning-plan/furniture-type-review';
export function FurnitureContextMenu({item,x,y,onChange,onClose,onCatalog,onReference}:{item:FurnitureItem;x:number;y:number;onChange:(patch:Partial<FurnitureItem>)=>void;onClose:()=>void;onCatalog:()=>void;onReference:()=>void}){
 const[choosing,setChoosing]=useState(needsFurnitureTypeReview(item));
 function choose(kind:FurnitureKind,catalogType?:string){onChange(confirmFurnitureType(item,kind,catalogType));onClose();}
 return <div className="planning-context-menu" role="menu" aria-label={choosing?'Что это за предмет?':'Действия с мебелью'} style={{left:x,top:Math.min(y,Math.max(8,window.innerHeight-(choosing?420:170)))}}>
  {choosing?<><strong>Что это за предмет?</strong><small>{item.cad?.blockName||item.name}</small><div className="planning-furniture-type-list">{furnitureTypeChoices.map(t=><button key={t.id} role="menuitem" onClick={()=>choose(t.kind,t.catalogType)}>{t.name}</button>)}</div></>:<><button role="menuitem" onClick={onCatalog}>Добавить из каталога</button><button role="menuitem" onClick={onReference}>Загрузить референс</button><button role="menuitem" onClick={()=>setChoosing(true)}>Изменить тип предмета</button></>}
 </div>;
}
