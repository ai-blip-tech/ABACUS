import {matchesCatalogType} from './catalog-filter.ts';
import {loadSurfaceCatalog} from './surface-catalog.ts';
import { loadFurnitureCatalog, type FurnitureCatalogProduct } from "./furniture-catalog.ts";
import { loadLightingCatalog, type LightingProduct, type LightingProductType } from "./lighting-catalog.ts";

export type StudioCatalogProduct = Omit<FurnitureCatalogProduct,"source"> & {source:"norrmobler"|"leve-home"|"gomoon"};
export const lightingSubtypeLabels:Record<LightingProductType,string> = {track:"Треки",track_fixture:"Трековые светильники",fixture:"Светильники",power:"Источники питания",accessory:"Комплектующие"};

export function catalogProductHasPhoto(product:{image:string}) {
  try {const url=new URL(product.image.trim());return url.protocol==="https:"||url.protocol==="http:";}
  catch {return false;}
}

export function lightingAsStudioProduct(product:LightingProduct):StudioCatalogProduct {
  const parameters:Array<{name:string;value:string}>=[];
  for(const [name,value,unit] of [["Мощность",product.specs.powerW,"Вт"],["Напряжение",product.specs.voltageV,"В"],["Цветовая температура",product.specs.cctK,"К"],["Угол света",product.specs.beamDeg,"°"],["Длина",product.specs.lengthMm,"мм"]] as const)if(value!==null)parameters.push({name,value:`${value} ${unit}`});
  return {id:product.id,sourceId:product.offerId,source:"gomoon",brand:product.brand,name:product.name,article:product.article,image:product.image,images:product.images,url:product.url,price:product.price,oldPrice:0,available:product.available,category:product.category,subtype:lightingSubtypeLabels[product.type],color:"",material:"",widthMm:product.specs.lengthMm,depthMm:null,heightMm:null,description:product.description,parameters,_trail:product.categoryTrail,_updatedAt:new Date().toISOString()};
}

export async function loadStudioCatalog() {
  const [furniture,lighting,surfaces]=await Promise.allSettled([loadFurnitureCatalog(),loadLightingCatalog(),loadSurfaceCatalog()]);
  const qualifiedTiles=new Set(surfaces.status==='fulfilled'?surfaces.value.map(p=>p.id):[]);
  const products:StudioCatalogProduct[]=[...(furniture.status==="fulfilled"?furniture.value.products:[]),...(lighting.status==="fulfilled"?lighting.value.map(lightingAsStudioProduct):[]),...(surfaces.status==="fulfilled"?surfaces.value:[])].filter(catalogProductHasPhoto).filter(p=>!matchesCatalogType(p,'porcelain',p._trail||'')||qualifiedTiles.has(p.id));
  const unavailableSources=[...(surfaces.status==="rejected"?["NORR Ceramic"]:[]),...(furniture.status==="fulfilled"?furniture.value.unavailableSources:["norrmobler","leve-home"]),...(lighting.status==="rejected"?["gomoon"]:[])];
  if(!products.length)throw new Error("Каталоги временно недоступны.");
  return {products:[...new Map(products.map(p=>[p.id,p])).values()],unavailableSources};
}
