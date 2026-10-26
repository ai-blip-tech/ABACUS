import assert from "node:assert/strict";
import test from "node:test";
import { catalogProductHasPhoto, loadStudioCatalog } from "../lib/studio-catalog.ts";
import { furnitureCatalogNavigation } from "../lib/furniture-catalog-navigation.ts";
import { matchesCatalogType } from "../lib/catalog-filter.ts";

test("all three suppliers exclude products without photographs and GoMoon joins its own section",async()=>{
  const original=globalThis.fetch;
  const furniture=`<shop><categories><category id="1">Диваны</category></categories><offers><offer id="norr-photo" available="true"><name>Диван FUGA</name><categoryId>1</categoryId><param name="Бренд">FUGA</param><picture>https://norrmobler.ru/photo.jpg</picture></offer><offer id="norr-empty" available="true"><name>Диван без фото</name><param name="Бренд">FUGA</param><categoryId>1</categoryId></offer></offers></shop>`;
  const leve=`<shop><categories><category id="1">Стулья</category></categories><offers><offer id="leve-photo" available="true"><name>Стул LEVE</name><categoryId>1</categoryId><stock>1</stock><picture>https://levehome.ru/photo.jpg</picture></offer><offer id="leve-empty" available="true"><name>Стул без фото</name><categoryId>1</categoryId><stock>2</stock><picture>   </picture></offer></offers></shop>`;
  const gomoon=`<shop><categories><category id="1">ТРЕКИ</category></categories><offers><offer id="track-photo" available="true"><name>Трек 2000 мм 48 В</name><categoryId>1</categoryId><picture>https://gomoon.ru/track.jpg</picture><price>1000</price></offer><offer id="track-empty" available="true"><name>Трек без фото</name><categoryId>1</categoryId></offer></offers></shop>`;
  globalThis.fetch=async input=>new Response(String(input).includes("gomoon.ru")?gomoon:String(input).includes("rom-divan.ru")?leve:furniture);
  try{
    const {products,unavailableSources}=await loadStudioCatalog();
    assert.equal(products.length,3);
    assert.deepEqual(unavailableSources,[]);
    assert.ok(products.every(catalogProductHasPhoto));
    assert.deepEqual(new Set(products.map(product=>product.source)),new Set(["norrmobler","leve-home","gomoon"]));
    const technical=products.filter(product=>matchesCatalogType(product,"technical_light",product._trail||""));
    assert.equal(technical.length,1);
    assert.equal(technical[0].id,"gomoon:track-photo");
    assert.equal(technical[0].subtype,"Треки");
    assert.equal(technical[0].widthMm,2000);
    assert.equal(matchesCatalogType(technical[0],"light",technical[0]._trail),false);
    const navigation=furnitureCatalogNavigation(products);
    assert.ok(navigation.productBrands.some(brand=>brand.name==="GoMoon"));
    assert.deepEqual(navigation.categorySubtypes.technical_light,["Треки","Трековые светильники","Светильники","Источники питания","Комплектующие"]);
  }finally{globalThis.fetch=original;}
});

test("the shared photograph rule rejects empty and invalid image URLs",()=>{
  for(const image of [""," ","not-a-photo","javascript:alert(1)"])assert.equal(catalogProductHasPhoto({image}),false);
  assert.equal(catalogProductHasPhoto({image:"https://gomoon.ru/photo.jpg"}),true);
});
