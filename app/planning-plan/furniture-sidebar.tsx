'use client';
import {InteriorFurnitureChoices} from '../interior-furniture-choices';
import {StudioMaterialTray} from '../studio-material-tray';
import {FurnitureSymbol} from './furniture-editor';
import {furnitureTemplates,type FurnitureItem} from '@/lib/planning-plan/furniture';
import {furnitureFromInterior} from '@/lib/planning-plan/furniture-sidebar';

export function PlanningFurnitureSidebar({area,onAdd,onCatalog}:{area:number|null;onAdd:(f:FurnitureItem)=>void;onCatalog:()=>void}){
 return <section className="planogram-panel planning-interior-sidebar" aria-label="Мебель и оборудование справа">
  <div className="plan-room-summary"><span>ЧИСТАЯ ПОЛЕЗНАЯ ПЛОЩАДЬ</span><b>{area===null?'Не определена':area.toLocaleString('ru-RU',{maximumFractionDigits:2})+' м²'}</b></div>
  <button type="button" className="plan-catalog-select planning-sidebar-catalog" onClick={()=>onCatalog()}>Добавить из каталога <span aria-hidden="true">→</span></button>
  <label>ДОБАВИТЬ ПРЕДМЕТ</label>
  <InteriorFurnitureChoices onAdd={t=>onAdd(furnitureFromInterior(t))}/>
  <details className="planning-equipment"><summary>Кухня и сантехника</summary><div className="plan-template-grid">{furnitureTemplates.filter(t=>['kitchen','fridge','bath','shower','toilet','sink'].includes(t.kind)).map(t=><button key={t.kind} type="button" onClick={()=>onAdd({...t,id:crypto.randomUUID(),position:[0,0],rotation:0,dimensionsSource:'template'})}><span>{t.name}</span></button>)}</div></details>
  <p className="plan-select-note">Нажмите на предмет — он появится в центре вида. Перетаскивание — переместить; двойной клик — размеры и поворот. Габариты шаблонные, их можно уточнить.</p>
 </section>;
}

export function PlanningFurnitureTray({items,selected,onSelect,onRemove,onCatalog,onUpload}:{items:FurnitureItem[];selected:string;onSelect:(id:string)=>void;onRemove:(id:string)=>void;onCatalog:()=>void;onUpload:()=>void}){
 return <StudioMaterialTray ariaLabel="Мебель на плане" items={items.map(f=>({id:f.id,image:f.reference?.image||f.catalog?.image,thumbnail:<svg viewBox="0 0 120 90" aria-label={f.name}><FurnitureSymbol kind={f.kind} width={100} depth={70} cad={f.cad}/></svg>,eyebrow:f.catalog?.brand||(f.reference?'РЕФЕРЕНС':'МЕБЕЛЬ'),name:f.name,details:(f.catalog?.article?'Арт. '+f.catalog.article+' · ':'')+f.width+' × '+f.depth+' × '+(f.height??'—')+' мм',selected:selected===f.id}))} onSelect={onSelect} onRemove={onRemove} onCatalog={onCatalog} onUpload={onUpload} footerMessage="Мебель на плане. Нажмите на предмет, чтобы изменить его размеры справа."/>;
}
