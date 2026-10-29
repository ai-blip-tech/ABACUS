import {newFurniture,type FurnitureItem,type FurnitureKind} from './furniture.ts';
import type {InteriorFurnitureTemplate} from '../interior-furniture-templates';
import type {CatalogProduct} from '../furniture-catalog-product';
import {matchesCatalogType} from '../catalog-filter.ts';
import {furnitureCatalogCategories} from '../furniture-catalog-options.ts';

export function furnitureFromInterior(t:InteriorFurnitureTemplate):FurnitureItem{
 const kind: FurnitureKind=t.kind==='chair'?'armchair':t.kind==='stool'?(t.name==='Пуф'?'ottoman':'chair'):t.kind==='cabinet'?(t.name==='Стеллаж'?'shelf':'wardrobe'):t.kind==='table'&&t.name.includes('письменный')?'desk':t.kind;
 const item={...newFurniture(kind,[0,0]),name:t.name,width:t.width,depth:t.depth};
 return {...item,catalogType:furnitureCatalogType(item)};
}
/** Separate catalog taxonomy from the shared 2D symbol (several tables use kind=table). */
export function furnitureCatalogType(item:Pick<FurnitureItem,'kind'|'name'|'catalog'|'catalogType'>):string{
 if(item.catalogType&&furnitureCatalogCategories.some(c=>c.type===item.catalogType))return item.catalogType;
 const name=(item.name+' '+(item.catalog?.name||'')).toLowerCase().replace(/ё/g,'е');
 if(item.kind==='table'){
  if(/журнальн|кофейн|приставн|coffee|side table/.test(name))return 'coffee_table';
  if(/письменн|туалетн|desk/.test(name))return 'desk_table';
  if(/консол|console/.test(name))return 'console';
  return 'dining_table';
 }
 if(item.kind==='wardrobe')return /обувниц|галошниц/.test(name)?'shoe_rack':'cabinet';
 if(item.kind==='shelf')return /полк/.test(name)?'shelf':'shelving';
 if(item.kind==='lamp')return item.catalog?.source==='gomoon'||/техническ/.test(name)?'technical_light':'light';
 const type=item.kind==='desk'?'desk_table':item.kind;
 return furnitureCatalogCategories.some(c=>c.type===type)?type:'decor';
}
export function catalogFurnitureKind(type:string):FurnitureKind|null{
 const kinds:Record<string,FurnitureKind>={sofa:'sofa',armchair:'armchair',chair:'chair',ottoman:'ottoman',dining_table:'table',coffee_table:'table',desk_table:'desk',console:'table',shoe_rack:'wardrobe',bed:'bed',rug:'rug',light:'lamp',technical_light:'lamp',decor:'decor',cabinet:'wardrobe',dresser:'dresser',nightstand:'nightstand',tv_stand:'tv_stand',shelving:'shelf',shelf:'shelf'};
 return kinds[type]||null;
}
/** Global catalog search ignores the current category, so classify the actual result first. */
export function catalogProductType(p:CatalogProduct,fallbackType:string):string{
 const order=['nightstand','tv_stand','ottoman','armchair','chair','bed','sofa','desk_table','coffee_table','dining_table','console','shoe_rack','shelving','shelf','dresser','cabinet','rug','technical_light','light','decor'];
 const type=order.find(type=>matchesCatalogType(p,type,p.category));
 return type||fallbackType;
}
export function catalogProductKind(p:CatalogProduct,fallbackType:string):FurnitureKind|null{return catalogFurnitureKind(catalogProductType(p,fallbackType));}
/** Catalog dimensions stay in mm; missing dimensions retain the explicitly labelled template. */
export function furnitureFromCatalog(p:CatalogProduct,kind:FurnitureKind,category?:string):FurnitureItem{
 const f=newFurniture(kind,[0,0]);
 f.catalogType=catalogProductType(p,category||furnitureCatalogType(f));
 const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=10&&n<=20000;
 if(valid(p.widthMm))f.width=p.widthMm;if(valid(p.depthMm))f.depth=p.depthMm;if(valid(p.heightMm))f.height=p.heightMm;
 f.dimensionsSource=valid(p.widthMm)&&valid(p.depthMm)&&valid(p.heightMm)?'catalog':'template';
 f.name=p.name.slice(0,240);f.catalog={id:p.id,name:f.name,source:p.source||p.brand||'catalog',url:/^https?:\/\//i.test(p.url)?p.url:'',image:/^(https?:\/\/|\/(?!\/))/i.test(p.image)?p.image:'',brand:p.brand.slice(0,240),article:p.article.slice(0,240)};
 return f;
}
