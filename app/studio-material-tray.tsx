'use client';
import type {DragEvent,ReactNode} from 'react';

export type StudioTrayItem={id:string;image?:string;thumbnail?:ReactNode;eyebrow:string;name:string;details:string;selected:boolean;selectable?:boolean;removable?:boolean;removeLabel?:string;draggable?:boolean};
/** Original Image Editor tray, shared without duplicating its cards or visual classes. */
export function StudioMaterialTray({items,onSelect,onRemove,onDragStart,onUpload,onCatalog,children,ariaLabel='Материалы текущего проекта',footerMessage}:{items:StudioTrayItem[];onSelect:(id:string)=>void;onRemove:(id:string)=>void;onDragStart?:(id:string,event:DragEvent<HTMLElement>)=>void;onUpload:()=>void;onCatalog:(trigger:HTMLElement)=>void;children?:ReactNode;ariaLabel?:string;footerMessage?:string}){
 const hasMaterials=items.length>0;
 const info=(item:StudioTrayItem)=><span><small>{item.eyebrow}</small><b>{item.name}</b><em>{item.details}</em></span>;
 return <div className={`studio-material-tray${hasMaterials?' has-materials':' is-empty'}`} aria-label={ariaLabel}>
  {children}
  {!hasMaterials?<div className="studio-material-empty"><button type="button" onClick={onUpload}><span>＋</span><b>Загрузить референс</b><small>Свой предмет, ткань или фактура</small></button><button type="button" onClick={e=>onCatalog(e.currentTarget)}><span>⌕</span><b>Выбрать из каталога</b><small>NORR Møbler и LEVE HOME</small></button></div>:<>
   <div className="studio-material-actions"><button type="button" onClick={onUpload}><span>＋</span><b>Референс</b></button><button type="button" onClick={e=>onCatalog(e.currentTarget)}><span>⌕</span><b>Каталог</b></button></div>
   <div className="studio-material-list" role="list">{items.map(item=><article key={item.id} className={(item.selected?'studio-material-card active':'studio-material-card')+(item.draggable?' is-draggable':'')} role="listitem" draggable={item.draggable} onDragStart={event=>{if(item.draggable&&onDragStart)onDragStart(item.id,event);}}>
    {item.selectable===false?<><img src={item.image} alt={item.name}/>{info(item)}</>:<button type="button" className="studio-material-select" aria-pressed={item.selected} onClick={()=>onSelect(item.id)}>{item.thumbnail&&!item.image?<span className="studio-material-thumbnail">{item.thumbnail}</span>:<img src={item.image} alt={item.name}/>} {info(item)}</button>}
    {item.removable!==false&&<button type="button" className="studio-material-remove" aria-label={item.removeLabel||`Удалить ${item.name}`} onClick={()=>onRemove(item.id)}>×</button>}
   </article>)}</div>
  </>}
  <footer><span>{footerMessage||(hasMaterials?'Материалы, выбранные для этого проекта':'Добавьте первый материал — каталог не запускает генерацию автоматически')}</span></footer>
 </div>;
}
