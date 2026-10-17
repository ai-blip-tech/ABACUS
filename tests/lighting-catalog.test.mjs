import assert from "node:assert/strict";
import test from "node:test";

import { parseLightingCatalog } from "../lib/lighting-catalog.ts";

const xml = `<?xml version="1.0"?><yml_catalog><shop><categories>
  <category id="287">ТРЕКОВАЯ СИСТЕМА GALILEO</category>
  <category id="288" parentId="287">ТРЕКИ</category>
  <category id="290" parentId="287">СВЕТИЛЬНИКИ</category>
  <category id="319">ИНТЕРЬЕРНЫЙ СВЕТ</category>
  <category id="320" parentId="319">ИСТОЧНИКИ ПИТАНИЯ</category>
</categories><offers>
  <offer id="track-1" available="true"><url>http://gomoon.ru/track</url><price>4500</price><currencyId>RUB</currencyId><categoryId>288</categoryId><picture>http://gomoon.ru/track.jpg</picture><vendorCode>24001-2M-BL</vendorCode><name>Трек встраиваемый 2м 48 В</name><description></description></offer>
  <offer id="light-1" available="false"><url>http://gomoon.ru/light</url><price>7200</price><currencyId>RUB</currencyId><categoryId>290</categoryId><vendorCode>21001</vendorCode><name>SOLAR 48 В 10Вт 3000К угол 36°</name><description></description></offer>
  <offer id="power-1" available="true"><url>http://gomoon.ru/power</url><price>1200</price><currencyId>RUB</currencyId><categoryId>320</categoryId><picture>http://gomoon.ru/power.jpg</picture><vendorCode>19001</vendorCode><name>Источник питания 48 В 100Вт</name><description></description></offer>
</offers></shop></yml_catalog>`;

test("GoMoon lighting feed becomes a provider-scoped technical catalog", () => {
  const products = parseLightingCatalog(xml);
  assert.equal(products.length, 2);
  assert.equal(products[0].id, "gomoon:track-1");
  assert.equal(products[0].type, "track");
  assert.equal(products[0].specs.lengthMm, 2000);
  assert.equal(products[0].image, "https://gomoon.ru/track.jpg");
  assert.equal(products[1].type, "power");
});

test("GoMoon products without photos are excluded from the catalog", () => {
  const products = parseLightingCatalog(xml);
  assert.equal(products.some((product) => product.offerId === "light-1"), false);
  assert.equal(products.every((product) => product.image.length > 0), true);
});

