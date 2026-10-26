import assert from "node:assert/strict";
import test from "node:test";
import {catalogFeature,matchesCatalogFeature} from "../lib/catalog-features.ts";
const product=(name,value)=>({parameters:[{name,value}]});
test("missing feature values count as no, not yes",()=>{
  for(const key of ["recliner","sleeper","ottoman"]){
    assert.equal(catalogFeature({parameters:[]},key),false);
    assert.ok(matchesCatalogFeature({parameters:[]},key,"no"));
    assert.equal(matchesCatalogFeature({parameters:[]},key,"yes"),false);
    assert.ok(matchesCatalogFeature({parameters:[]},key,""));
  }
});
test("recliner and ottoman use exact supplier fields",()=>{
  assert.ok(catalogFeature(product("Реклайнер","Да"),"recliner"));
  assert.ok(catalogFeature(product("Наличие оттоманки","Да"),"ottoman"));
  assert.equal(catalogFeature(product("Наличие оттоманки","Нет"),"ottoman"),false);
  assert.equal(catalogFeature(product("Длина оттоманки","280"),"ottoman"),false);
});
test("sleeper supports explicit flags and named mechanisms; explicit no wins",()=>{
  assert.ok(catalogFeature(product("Спальное место","Да"),"sleeper"));
  assert.ok(catalogFeature(product("Спальное место","Итальянская раскладушка SELECT"),"sleeper"));
  assert.equal(catalogFeature({parameters:[{name:"Спальное место (наличие)",value:"Нет"},{name:"Спальное место",value:"SELECT"}]},"sleeper"),false);
});
