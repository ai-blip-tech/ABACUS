import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { furnitureBrandForDisplay, parseFurnitureCatalog } from "../lib/furniture-catalog.ts";
import { matchesCatalogType } from "../lib/catalog-filter.ts";

const leveFeed = `<?xml version="1.0"?><yml_catalog><shop><categories>
  <category id="1">Столы журнальные</category><category id="2">Комоды</category>
</categories><offers>
  <offer available="true" id="coffee-1"><name>Стол журнальный LUNA</name><vendorCode>LV-01</vendorCode><categoryId>1</categoryId><stock>2</stock><price>24000</price><picture>https://example.com/table.jpg</picture><dimensions>120/60/45</dimensions><param name="Материал">Дерево</param></offer>
  <offer id="dresser-1" available="true"><name>Комод LINE</name><vendorCode>LV-02</vendorCode><categoryId>2</categoryId><stock>0</stock><price>42000</price><picture>https://example.com/dresser.jpg</picture></offer>
  <offer id="dresser-2" available="false"><name>Комод OFF</name><categoryId>2</categoryId><stock>4</stock><picture>https://example.com/off.jpg</picture></offer>
</offers></shop></yml_catalog>`;

const norrBrandFeed = `<?xml version="1.0"?><yml_catalog><shop><categories><category id="1">Мебель</category></categories><offers>
  <offer available="true" id="norr-1"><name>Кресло Brand Test</name><vendor>Norr Mobler</vendor><categoryId>1</categoryId><picture>https://example.com/chair.jpg</picture><param name="Бренд">ROM</param><param name="Производитель">NORR Mobler</param></offer>
  <offer available="true" id="norr-2"><name>Плитка Excluded</name><vendor>Norr Mobler</vendor><categoryId>1</categoryId><picture>https://example.com/tile.jpg</picture><param name="Бренд">CIFRE</param></offer>
</offers></shop></yml_catalog>`;

test("LEVE HOME keeps all products and marks stock accurately for the optional availability filter", () => {
  const products = parseFurnitureCatalog(leveFeed, "leve-home");
  assert.equal(products.length, 3);
  assert.deepEqual(products.map(product=>product.available), [true, false, false]);
  assert.equal(products[0].brand, "LEVE HOME");
  assert.equal(products[0].id, "leve-home:coffee-1");
  assert.equal(products[0].article, "LV-01");
  assert.equal(products[0].widthMm, 1200);
  assert.equal(products[0].depthMm, 600);
  assert.equal(products[0].heightMm, 450);
  assert.equal(matchesCatalogType(products[0], "coffee_table", products[0]._trail || ""), true);
});

test("NORR feed maps the product brand ROM to the public NORR Møbler brand", () => {
  const products = parseFurnitureCatalog(norrBrandFeed, "norrmobler");
  assert.equal(products.length, 1);
  const [product] = products;
  assert.equal(product.brand, "NORR Møbler");
  assert.equal(product.source, "norrmobler");
});

test("legacy one-r Normobler values are always shown as NORR Møbler", () => {
  assert.equal(furnitureBrandForDisplay("Normobler"), "NORR Møbler");
  const products = parseFurnitureCatalog(norrBrandFeed.replace("ROM", "Normobler"), "norrmobler");
  assert.equal(products.length, 1);
  assert.equal(products[0].brand, "NORR Møbler");
});

test("LEVE HOME category names map to every new furniture section", () => {
  const examples = [
    ["console", "Консоли напольные"], ["shelf", "Полки фигурные"], ["shoe_rack", "Обувницы с вешалкой для одежды"],
    ["decor", "Декор настенный"], ["rug", "Ковры современные"], ["shelving", "Стеллажи прямые"], ["tv_stand", "Тумбы для ТВ"],
  ];
  for (const [type, category] of examples) assert.equal(matchesCatalogType({ name: category, category, subtype: category }, type, `Каталог / ${category}`), true, `${category} -> ${type}`);
});

test("the planogram catalog can filter one or both furniture brands", () => {
  const source = readFileSync(new URL("../app/planogram-controls.ts", import.meta.url), "utf8");
  assert.match(source, /data-brand="norrmobler"/);
  assert.match(source, /data-brand="leve-home"/);
  assert.match(source, /params\.set\("brands", Array\.from\(selectedBrands\)\.join\(","\)\)/);
  assert.match(source, /selectedBrands\.has\(brand\)/);
});
