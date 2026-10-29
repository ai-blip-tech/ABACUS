import type {Point} from '../measured-plan/measure-model';
import {validateFurnitureReference,type FurnitureReference} from './furniture-reference.ts';
import {furnitureCatalogCategories} from '../furniture-catalog-options.ts';
import {validateCadSymbol,type CadSymbol} from './cad-symbol.ts';

export type FurnitureKind='wardrobe'|'table'|'chair'|'bed'|'sofa'|'armchair'|'desk'|'dresser'|'shelf'|'kitchen'|'fridge'|'bath'|'shower'|'toilet'|'sink'|'ottoman'|'rug'|'lamp'|'decor'|'plant'|'nightstand'|'tv_stand'|'tv';
export type FurnitureItem={id:string;kind:FurnitureKind;name:string;position:Point;width:number;depth:number;height:number|null;rotation:number;dimensionsSource:'template'|'catalog'|'user'|'dxf';cad?:CadSymbol;catalogType?:string;reference?:FurnitureReference;catalog?:{id:string;name:string;url:string;source:string;image?:string;brand?:string;article?:string};};
export const furnitureTemplates:{kind:FurnitureKind;name:string;width:number;depth:number;height:number}[]=[
 {kind:'wardrobe',name:'Шкаф',width:1800,depth:600,height:2400},{kind:'table',name:'Обеденный стол',width:1400,depth:800,height:750},
 {kind:'chair',name:'Стул',width:450,depth:500,height:850},{kind:'bed',name:'Кровать',width:1800,depth:2100,height:900},
 {kind:'sofa',name:'Диван',width:2200,depth:950,height:850},{kind:'armchair',name:'Кресло',width:850,depth:850,height:850},
 {kind:'desk',name:'Рабочий стол',width:1200,depth:600,height:750},{kind:'dresser',name:'Комод',width:1200,depth:450,height:850},
 {kind:'shelf',name:'Стеллаж',width:900,depth:350,height:2100},{kind:'kitchen',name:'Кухонный модуль',width:600,depth:600,height:900},
 {kind:'fridge',name:'Холодильник',width:600,depth:650,height:2000},{kind:'bath',name:'Ванна',width:1700,depth:750,height:600},
 {kind:'shower',name:'Душ',width:900,depth:900,height:2100},{kind:'toilet',name:'Унитаз',width:400,depth:650,height:750},
 {kind:'sink',name:'Раковина',width:600,depth:500,height:850},
 {kind:'ottoman',name:'Пуф',width:600,depth:600,height:450},{kind:'rug',name:'Ковер',width:2000,depth:1400,height:10},
 {kind:'lamp',name:'Светильник',width:400,depth:400,height:1600},{kind:'decor',name:'Декор для дома',width:500,depth:300,height:300},
 {kind:'plant',name:'Растение',width:550,depth:550,height:1200},{kind:'nightstand',name:'Прикроватная тумба',width:500,depth:400,height:550},
 {kind:'tv_stand',name:'TV-тумба',width:1600,depth:450,height:500},
 {kind:'tv',name:'Телевизор',width:1200,depth:80,height:700},
];
export function newFurniture(kind:FurnitureKind,position:Point):FurnitureItem{const t=furnitureTemplates.find(t=>t.kind===kind);if(!t)throw Error('Неизвестный тип мебели');return{...t,id:crypto.randomUUID(),position:[...position],rotation:0,dimensionsSource:'template'};}
export function furnitureCorners(f:FurnitureItem):Point[]{const a=f.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return([[-f.width/2,-f.depth/2],[f.width/2,-f.depth/2],[f.width/2,f.depth/2],[-f.width/2,f.depth/2]] as Point[]).map(([x,y])=>[f.position[0]+x*c-y*s,f.position[1]+x*s+y*c]);}
export function validateFurniture(value:unknown):FurnitureItem[]{if(!Array.isArray(value)||value.length>500)throw Error('Можно сохранить не более 500 предметов');const ids=new Set<string>();for(const f of value){if(!f||typeof f.id!=='string'||!/^[a-zA-Z0-9_-]{1,140}$/.test(f.id)||ids.has(f.id)||!furnitureTemplates.some(t=>t.kind===f.kind)||typeof f.name!=='string'||f.name.length>240||!Array.isArray(f.position)||f.position.length!==2||!f.position.every((n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=200000)||![f.width,f.depth].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=10&&n<=20000)||!(f.height===null||typeof f.height==='number'&&Number.isFinite(f.height)&&f.height>=10&&f.height<=20000)||typeof f.rotation!=='number'||!Number.isFinite(f.rotation)||Math.abs(f.rotation)>36000||!['template','catalog','user','dxf'].includes(f.dimensionsSource))throw Error('Некорректные параметры мебели');if(f.catalog&&(!['id','name','url','source'].every(k=>typeof f.catalog[k]==='string'&&f.catalog[k].length<=2000)||f.catalog.url&&!/^https?:\/\//i.test(f.catalog.url)))throw Error('Некорректная ссылка на каталог');if(f.catalog){for(const key of ['image','brand','article'])if(f.catalog[key]!==undefined&&(typeof f.catalog[key]!=='string'||f.catalog[key].length>2000))throw Error('Некорректные данные каталога');if(f.catalog.image&&!/^(https?:\/\/|\/(?!\/))/i.test(f.catalog.image))throw Error('Некорректное изображение каталога');}if(f.cad!==undefined)validateCadSymbol(f.cad);if(f.reference!==undefined)validateFurnitureReference(f.reference);if(f.catalogType!==undefined&&!furnitureCatalogCategories.some(c=>c.type===f.catalogType))throw Error('Некорректная категория мебели');ids.add(f.id);}return structuredClone(value);}
