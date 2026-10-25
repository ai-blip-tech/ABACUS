import assert from "node:assert/strict";
import test from "node:test";
import {matchesCatalogSearch,catalogDiscount} from "../lib/catalog-search.ts";

test("search matches articles, brands and names across product types",()=>{
  const product={name:"Ковёр JOY",article:"LEV01060",brand:"LEVE HOME",subtype:"Ковёр",color:"Синий",material:"Шерсть"};
  assert.ok(matchesCatalogSearch(product,"lev01060"));
  assert.ok(matchesCatalogSearch(product,"ковер joy"));
  assert.ok(matchesCatalogSearch(product,"LEVE HOME"));
  assert.equal(matchesCatalogSearch(product,"LEV00000"),false);
});

test("discount sorting uses percentage and leaves missing or invalid old prices last",()=>{
  const products=[{id:"none",price:80,oldPrice:0},{id:"twenty",price:800,oldPrice:1000},{id:"half",price:50,oldPrice:100},{id:"invalid",price:0,oldPrice:100}];
  products.sort((a,b)=>catalogDiscount(b)-catalogDiscount(a));
  assert.deepEqual(products.map(p=>p.id),["half","twenty","none","invalid"]);
  assert.equal(catalogDiscount({price:100,oldPrice:80}),0);
});
