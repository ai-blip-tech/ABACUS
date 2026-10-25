import { matchesCatalogType } from "./catalog-filter.ts";
import { furnitureCatalogCategories } from "./furniture-catalog-options.ts";
import { lightingSubtypeLabels, type StudioCatalogProduct } from "./studio-catalog.ts";
import { matchesCatalogSearch } from "./catalog-search.ts";

const normalize = (value:string) => value.toLocaleLowerCase("ru-RU").replace(/ё/g,"е").replace(/\s+/g," ").trim();
export const furnitureBrandId = (name:string) => `brand:${normalize(name)}`;

type ColorProduct=Pick<StudioCatalogProduct,"color"|"parameters"|"name"|"category"|"subtype"|"source"|"_trail">;
export function catalogProductColors(product:ColorProduct) {
  const upholsteryOnly=matchesCatalogType(product,"sofa",product._trail||"")||matchesCatalogType(product,"armchair",product._trail||"");
  const values=upholsteryOnly
    ? product.parameters.filter(item=>normalize(item.name)==="цвет обивки").map(item=>item.value)
    : [product.color,...product.parameters.filter(item=>/цвет/i.test(item.name)&&!/температур|свечени|света/i.test(item.name)).map(item=>item.value)];
  return [...new Map(values.map(value=>value.trim()).filter(value=>Boolean(value)&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)&&!/^[\d\s.,/-]+$/.test(value)&&!/^[a-z]{1,4}\d+$/i.test(value)).map(value=>[normalize(value),value])).values()];
}

export function matchesCatalogColor(product:ColorProduct,color:string) {
  return !color || catalogProductColors(product).some(value=>normalize(value)===normalize(color));
}

export function matchesFurnitureBrand(product:Pick<StudioCatalogProduct,"source"|"brand">, selected:Set<string>) {
  return !selected.size || selected.has(normalize(product.source)) || selected.has(normalize(product.brand)) || selected.has(furnitureBrandId(product.brand));
}

export function furnitureCatalogNavigation(products:StudioCatalogProduct[],context:{type?:string;brands?:Set<string>;query?:string}={}) {
  const brandProducts=products.filter(product=>context.query?matchesCatalogSearch(product,context.query):!context.type||matchesCatalogType(product,context.type,product._trail||""));
  const byBrand=new Map<string,{id:string;name:string;count:number}>();
  for(const product of products){const id=furnitureBrandId(product.brand);if(!byBrand.has(id))byBrand.set(id,{id,name:product.brand,count:0});}
  for(const product of brandProducts)byBrand.get(furnitureBrandId(product.brand))!.count++;
  const productBrands=[...byBrand.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  const categoryProducts=context.brands?.size===1?products.filter(product=>matchesFurnitureBrand(product,context.brands!)):products;
  const categoryCounts=Object.fromEntries(furnitureCatalogCategories.map(category=>[category.type,categoryProducts.filter(product=>matchesCatalogType(product,category.type,product._trail||"")).length]));
  const categorySubtypes=Object.fromEntries(furnitureCatalogCategories.map(category=>[category.type,
    category.type==="technical_light"?Object.values(lightingSubtypeLabels):[...new Set(categoryProducts.filter(product=>matchesCatalogType(product,category.type,product._trail||"")).map(product=>product.subtype).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ru")),
  ]));
  const categoryColors=Object.fromEntries(furnitureCatalogCategories.map(category=>[category.type,
    [...new Map(products.filter(product=>matchesCatalogType(product,category.type,product._trail||"")).flatMap(catalogProductColors).map(value=>[normalize(value),value])).values()].sort((a,b)=>a.localeCompare(b,"ru")),
  ]));
  return {productBrands,categorySubtypes,categoryColors,categoryCounts};
}
