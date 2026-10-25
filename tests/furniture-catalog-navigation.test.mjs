import assert from "node:assert/strict";
import test from "node:test";
import { parseFurnitureCatalog } from "../lib/furniture-catalog.ts";
import { furnitureBrandId, furnitureCatalogNavigation, matchesFurnitureBrand, catalogProductColors, matchesCatalogColor } from "../lib/furniture-catalog-navigation.ts";

const brands=["ROM","NORR Carpets","FUGA","SEYVAA PARIS","MOBLIBERICA"];
const feed=`<shop><categories><category id="1">Диваны</category><category id="2">Стулья</category></categories><offers>${brands.map((brand,index)=>`<offer id="${index}" available="${index%2===0}"><name>Диван ${index}</name><categoryId>1</categoryId><picture>https://example.test/${index}.jpg</picture><param name="Бренд">${brand}</param><param name="Тип">${index%2?"Угловой":"Прямой"}</param></offer>`).join("")}</offers></shop>`;

test("catalog lists product brands rather than just the two feed sources",()=>{
  const products=parseFurnitureCatalog(feed,"norrmobler");
  const {productBrands,categorySubtypes}=furnitureCatalogNavigation(products);
  assert.deepEqual(new Set(productBrands.map(brand=>brand.name)),new Set(["NORR Møbler",...brands.slice(1)]));
  assert.equal(productBrands.reduce((count,brand)=>count+brand.count,0),products.length);
  assert.deepEqual(categorySubtypes.sofa,["Прямой","Угловой"]);
  assert.deepEqual(categorySubtypes.chair,[]);
});

test("a product brand selects only that brand while legacy source filtering remains supported",()=>{
  const products=parseFurnitureCatalog(feed,"norrmobler");
  assert.equal(products.filter(product=>matchesFurnitureBrand(product,new Set([furnitureBrandId("NORR Møbler")]))).length,1);
  assert.equal(products.filter(product=>matchesFurnitureBrand(product,new Set(["norrmobler"]))).length,5);
  assert.deepEqual(products.filter(product=>matchesFurnitureBrand(product,new Set([furnitureBrandId("FUGA"),furnitureBrandId("SEYVAA PARIS")]))).map(product=>product.brand),["FUGA","SEYVAA PARIS"]);
});

test("all variants remain in navigation beyond the old limit of 24 and include out-of-stock goods",()=>{
  const products=parseFurnitureCatalog(feed,"norrmobler");
  const expanded=Array.from({length:30},(_,index)=>({...products[0],id:String(index),subtype:`Вариант ${index}`,available:false}));
  assert.equal(furnitureCatalogNavigation(expanded).categorySubtypes.sofa.length,30);
});

test("brand counts follow category and a single brand scopes categories and variants",()=>{
  const base=parseFurnitureCatalog(feed,"norrmobler")[0];
  const products=[
    {...base,id:"fuga-sofa",brand:"FUGA",name:"Диван",category:"Диваны",subtype:"Прямой",_trail:"Диваны"},
    {...base,id:"norr-sofa",brand:"NORR Møbler",name:"Диван",category:"Диваны",subtype:"Угловой",_trail:"Диваны"},
    {...base,id:"fuga-chair",brand:"FUGA",name:"Кресло",category:"Кресла",subtype:"Кресло",_trail:"Кресла"},
    {...base,id:"leve-cabinet",source:"leve-home",brand:"LEVE HOME",name:"Шкаф",category:"Шкафы",subtype:"Шкаф",_trail:"Шкафы"},
    {...base,id:"gomoon-light",source:"gomoon",brand:"GoMoon",name:"Светильник",category:"Свет",subtype:"Светильники",_trail:"Свет"},
  ];
  const nav=furnitureCatalogNavigation(products,{type:"sofa",brands:new Set(["brand:fuga"])});
  assert.deepEqual(Object.fromEntries(nav.productBrands.map(b=>[b.name,b.count])),{"FUGA":1,"GoMoon":0,"LEVE HOME":0,"NORR Møbler":1});
  assert.equal(nav.categoryCounts.sofa,1);
  assert.equal(nav.categoryCounts.armchair,1);
  assert.equal(nav.categoryCounts.cabinet,0);
  assert.equal(nav.categoryCounts.shoe_rack,0);
  assert.deepEqual(nav.categorySubtypes.sofa,["Прямой"]);
  const all=furnitureCatalogNavigation(products,{type:"cabinet"});
  assert.equal(all.productBrands.find(b=>b.name==="LEVE HOME").count,1);
  assert.equal(all.categoryCounts.technical_light,1);
  const search=furnitureCatalogNavigation(products,{type:"sofa",query:"Светильник"});
  assert.equal(search.productBrands.find(b=>b.name==="GoMoon").count,1);
});

test("color facets use supplier colors, deduplicate them and exclude light temperature",()=>{
  const base={...parseFurnitureCatalog(feed,"norrmobler")[0],name:"Стол",category:"Столы",subtype:"Обеденный",_trail:"Столы"};
  const product={...base,color:"Белый",parameters:[{name:"Цвет корпуса",value:"белый"},{name:"Цвет ткани",value:"Бежевый"},{name:"Цветовая температура",value:"3000 К"}]};
  assert.deepEqual(catalogProductColors(product),["белый","Бежевый"]);
  assert.ok(matchesCatalogColor(product,"БЕЛЫЙ"));
  assert.equal(matchesCatalogColor(product,"3000 К"),false);
  assert.equal(matchesCatalogColor(product,"Беж"),false);
  assert.deepEqual(catalogProductColors({...base,color:"23c39be4-1193-11f1-a5fb-ac1f6bf10149",parameters:[{name:"Цвет",value:"0710"}]}),[]);
  assert.deepEqual(furnitureCatalogNavigation([product]).categoryColors.dining_table,["Бежевый","белый"]);
});

test("sofas and armchairs use only upholstery color with no fallback to fabric or generic color",()=>{
  const base=parseFurnitureCatalog(feed,"norrmobler")[0];
  for(const [name,type] of [["Диван","sofa"],["Кресло","armchair"]]){
    const product={...base,name,category:name,subtype:name,_trail:name,color:"Красный",parameters:[{name:"Цвет",value:"Красный"},{name:"Ткань Цвет",value:"ANGORA"},{name:"Ткань 2 Цвет",value:"SAND"},{name:"Цвет обивки",value:"Серый"}]};
    assert.deepEqual(catalogProductColors(product),["Серый"]);
    assert.ok(matchesCatalogColor(product,"Серый"));
    assert.equal(matchesCatalogColor(product,"Красный"),false);
    assert.deepEqual(furnitureCatalogNavigation([product]).categoryColors[type],["Серый"]);
    assert.deepEqual(catalogProductColors({...product,parameters:product.parameters.filter(p=>p.name!=="Цвет обивки")}),[]);
    assert.deepEqual(catalogProductColors({...product,parameters:[{name:"Цвет обивки",value:"23c39be4-1193-11f1-a5fb-ac1f6bf10149"}]}),[]);
  }
});
