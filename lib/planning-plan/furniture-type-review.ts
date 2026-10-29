import type {FurnitureItem,FurnitureKind} from './furniture';
import {furnitureCatalogType} from './furniture-sidebar.ts';
import {furnitureCatalogCategories} from '../furniture-catalog-options.ts';
import {catalogFurnitureKind} from './furniture-sidebar.ts';
import {furnitureTemplates} from './furniture.ts';
import {dxfFurnitureKind} from './dxf-furniture-type.ts';
/** Catalog taxonomy is more detailed than the shared 2D symbol (e.g. tables). */
export const furnitureTypeChoices=[...furnitureCatalogCategories.map(c=>({id:c.type,name:c.name,kind:catalogFurnitureKind(c.type)!,catalogType:c.type as string})),...furnitureTemplates.filter(t=>['kitchen','fridge','bath','shower','toilet','sink','tv','plant'].includes(t.kind)).map(t=>({id:t.kind,name:t.name,kind:t.kind,catalogType:undefined}))];
/** Names are usable evidence, not visual recognition. Reject implausible dimensions
 * and conflicting names; an explicit human confirmation always takes precedence. */
export function plausibleFurnitureType(item:Pick<FurnitureItem,'kind'|'width'|'depth'|'name'>){
 const short=Math.min(item.width,item.depth),long=Math.max(item.width,item.depth);
 const bounds:Partial<Record<FurnitureKind,[number,number,number,number]>>={bed:[600,2500,1500,3000],sofa:[450,2200,1000,6000],chair:[200,1100,250,1300],armchair:[350,1800,400,2200],table:[250,1800,350,5000],desk:[300,1600,500,3500],wardrobe:[200,1500,250,6000],dresser:[200,1200,350,3500],tv_stand:[200,1000,400,4000],nightstand:[150,1000,200,1300],bath:[450,2200,900,3000],toilet:[250,1000,350,1400],sink:[150,1500,200,2500],shower:[500,2500,500,3000],fridge:[300,1800,350,2200],kitchen:[200,1800,200,8000]};
 const b=bounds[item.kind];return !b||(short>=b[0]&&short<=b[1]&&long>=b[2]&&long<=b[3]);
}
export function needsFurnitureTypeReview(item:FurnitureItem){return !!item.cad&&item.cad.classification!=='review'&&(item.cad.classification==='unknown'||dxfFurnitureKind(item.cad.blockName)!==item.kind||!plausibleFurnitureType(item));}
export function confirmFurnitureType(item:FurnitureItem,kind:FurnitureKind,catalogType?:string):Partial<FurnitureItem>{return{kind,catalogType:catalogType||furnitureCatalogType({kind,name:furnitureTemplates.find(t=>t.kind===kind)?.name||''}),...(item.cad?{cad:{...item.cad,classification:'review' as const}}:{})};}
