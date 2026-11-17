'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import FurnitureCatalogPage from '../furniture-catalog-page';
import {matchesCatalogType} from '@/lib/catalog-filter';
import type {FurnitureItem,FurnitureKind} from '@/lib/planning-plan/furniture';
import {catalogProductKind,furnitureFromCatalog,furnitureCatalogType} from '@/lib/planning-plan/furniture-sidebar';

type ArchiveTexture = {id:string;label:string;image:string};

async function requestArchiveModel(id:string, options:{inspect?:boolean;textureId?:string}) {
 const response = await fetch('/api/catalog/model-asset', {
  method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id,...options}),
 });
 const result = await response.json();
 if (!response.ok) throw Error(result.error || 'Не удалось подготовить модель');
 return result;
}

/** The full partner catalog from Image Editor, in the native top layer (also in fullscreen). */
export function PlanningFurnitureDialog({projectName,initialKind,initialItem,selectedIds,onClose,onAdd,replacing=false,prefer3D=false,onCustomCabinet}:{projectName:string;initialKind:FurnitureKind;initialItem?:FurnitureItem;selectedIds:string[];onClose:()=>void;onAdd:(item:FurnitureItem)=>void;replacing?:boolean;prefer3D?:boolean;onCustomCabinet?:(kind:"dresser"|"tv_stand")=>void}){
 const ref=useRef<HTMLDialogElement>(null),[error,setError]=useState('');
 const [choice,setChoice]=useState<{item:FurnitureItem;textures:ArchiveTexture[];selected:string}|null>(null);
 const [loading,setLoading]=useState('');
 const pending=useRef(false);
 useEffect(()=>{const d=ref.current;if(!d)return;d.showModal();return()=>d.close();},[]);
 const category=furnitureCatalogType(initialItem||{kind:initialKind,name:''});

 async function chooseItem(item:FurnitureItem) {
  if(pending.current)return;
  if(!prefer3D||!item.model3D?.url||!(/\.(rar|zip)(?:[?#]|$)/i).test(item.model3D.url)){onAdd(item);return;}
  pending.current=true;
  setError('');
  setLoading('Ищем текстуры в архиве модели…');
  try {
   const {textures}=await requestArchiveModel(item.model3D.productId,{inspect:true});
   if(textures.length){setChoice({item,textures,selected:''});return;}
   onAdd(item);
  } catch (cause) {
   setError((cause as Error).message);
  } finally {
   pending.current=false;
   setLoading('');
  }
 }

 async function addTexturedItem() {
  if(!choice?.selected||!choice.item.model3D||pending.current)return;
  pending.current=true;
  setError('');
  setLoading('Подготавливаем 3D-модель с выбранной текстурой…');
  const model3D={...choice.item.model3D,textureId:choice.selected};
  try {
   await requestArchiveModel(model3D.productId,{textureId:model3D.textureId});
   onAdd({...choice.item,model3D});
  } catch (cause) {
   setError((cause as Error).message);
  } finally {
   pending.current=false;
   setLoading('');
  }
 }

 return createPortal(<dialog ref={ref} className={choice?'planning-full-catalog planning-texture-dialog':'planning-full-catalog'} aria-label={choice?'Выбрать текстуру':'Каталог брендов партнеров'} onCancel={e=>{e.preventDefault();if(!pending.current){if(choice){setChoice(null);setError('');}else onClose();}}}>
  {error&&<p role="alert" className="planning-texture-feedback">{error}</p>}
  {loading&&<p role="status" className="planning-texture-feedback">{loading}</p>}
  {choice?<section className="planning-model-textures">
   <header><div><h2>Выберите текстуру</h2><p>{choice.item.name}</p></div><button type="button" aria-label="Закрыть" disabled={!!loading} onClick={onClose}>×</button></header>
   {choice.item.model3D?.productId==='leve-home:334625_283'&&<p>Выбранная текстура применяется к корпусу комода.</p>}
   <div className="planning-model-swatches" role="group" aria-label="Текстуры из архива">
    {choice.textures.map(texture=><button type="button" key={texture.id} disabled={!!loading} aria-pressed={choice.selected===texture.id} onClick={()=>setChoice({...choice,selected:texture.id})}>
     <img src={texture.image} alt=""/><span>{texture.label}</span>
    </button>)}
   </div>
   <footer><button type="button" disabled={!!loading} onClick={()=>{setChoice(null);setError('');}}>Назад в каталог</button><button type="button" className="partition-primary" disabled={!choice.selected||!!loading} onClick={()=>void addTexturedItem()}>Добавить мебель</button></footer>
  </section>:<div inert={!!loading}><FurnitureCatalogPage onCustomCabinet={onCustomCabinet} prefer3D={prefer3D} planning3D projectName={projectName} roomName="Планировочное решение" initialCategory={category} selectedIds={selectedIds} onClose={onClose} onSelect={(p,type)=>{
   if(matchesCatalogType(p,'porcelain',p.category)){setError('Керамогранит добавляется через слой «Пол» → «Плитка из каталога».');return;}
   void chooseItem(furnitureFromCatalog(p,replacing?initialKind:catalogProductKind(p,type)||initialKind,type));
  }}/></div>}
 </dialog>,document.body);
}
