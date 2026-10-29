'use client';
import {interiorFurnitureTemplates,type InteriorFurnitureTemplate} from '@/lib/interior-furniture-templates';
/** The same choices and icon classes in Interior Creation and the planning workspace. */
export function InteriorFurnitureChoices({onAdd}:{onAdd:(item:InteriorFurnitureTemplate)=>void}){
 return <div className="plan-template-grid">{interiorFurnitureTemplates.map(item=><button key={`${item.kind}:${item.name}`} type="button" onClick={()=>onAdd(item)}><i className={`plan-icon ${item.kind}`} aria-hidden="true"/><span>{item.name}</span></button>)}</div>;
}
