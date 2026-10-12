import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

import { validateRoomDesignContext } from "../lib/it/context-validation.ts";
import { ONO_CORE_VERSION, ONO_PROTOCOL_VERSION, onoServerEnabled, onoV2Enabled } from "../lib/it/version.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Ono 2.0 is the only sitewide Room Design assistant mount", async () => {
  const [layout, sitewide, orb] = await Promise.all([read("app/layout.tsx"), read("app/sitewide-it.tsx"), read("app/it-orb.tsx")]);
  assert.equal((layout.match(/<SitewideIt\b/g) || []).length, 1);
  assert.match(sitewide, /onoV2Enabled\(\)/);
  assert.equal((orb.match(/fetch\("\/api\/it"/g) || []).length, 2);
  assert.doesNotMatch(`${layout}\n${sitewide}\n${orb}`, /chat\/completions|\/api\/legacy[-_/]?(?:it|ono)|LegacyOno/);
  assert.equal(ONO_CORE_VERSION, "2.0.0-preview");
  assert.equal(ONO_PROTOCOL_VERSION, "2.0-preview");
});

test("Room Design Ono 2.0 feature flag is enabled by default and supports emergency disable", () => {
  const previous = process.env.NEXT_PUBLIC_ONO_V2_ENABLED;
  delete process.env.NEXT_PUBLIC_ONO_V2_ENABLED;
  assert.equal(onoV2Enabled(), true);
  process.env.NEXT_PUBLIC_ONO_V2_ENABLED = "false";
  assert.equal(onoV2Enabled(), false);
  if (previous === undefined) delete process.env.NEXT_PUBLIC_ONO_V2_ENABLED;
  else process.env.NEXT_PUBLIC_ONO_V2_ENABLED = previous;

  const previousServer = process.env.ONO_V2_ENABLED;
  process.env.ONO_V2_ENABLED = "false";
  assert.equal(onoServerEnabled(), false);
  if (previousServer === undefined) delete process.env.ONO_V2_ENABLED;
  else process.env.ONO_V2_ENABLED = previousServer;
});

test("NORR product context is bounded and strips unsupported fields", () => {
  const context = validateRoomDesignContext({
    route: "/catalog/nokto",
    page: "product",
    section: "other",
    commerce: {
      product: {
        id: "nokto-190",
        sku: "NOKTO-190",
        name: "Диван NOKTO",
        price: 620744,
        currency: "USD",
        availability: "invented",
        canonicalUrl: "javascript:alert(1)",
        email: "must-not-pass@example.test",
        attributes: [{ name: "Ширина", value: "1900 мм" }],
      },
    },
  });
  assert.deepEqual(context.commerce?.product && {
    id: context.commerce.product.id,
    sku: context.commerce.product.sku,
    name: context.commerce.product.name,
    price: context.commerce.product.price,
    currency: context.commerce.product.currency,
    availability: context.commerce.product.availability,
    canonicalUrl: context.commerce.product.canonicalUrl,
    attributes: context.commerce.product.attributes,
  }, {
    id: "nokto-190",
    sku: "NOKTO-190",
    name: "Диван NOKTO",
    price: 620744,
    currency: "RUB",
    availability: "unknown",
    canonicalUrl: "",
    attributes: [{ name: "Ширина", value: "1900 мм" }],
  });
  assert.equal("email" in (context.commerce?.product || {}), false);
});

test("shared SDK is singleton and version pinned without partner demo assets", async () => {
  const sdk = await read("public/ono-widget.js");
  assert.match(sdk, /VERSION = "2\.0-preview"/);
  assert.match(sdk, /instances\.has\(instanceKey\)/);
  await assert.rejects(access(new URL("../public/norr-sdk-preview.html", import.meta.url)));
  await assert.rejects(access(new URL("../integrations/norr-ono-2/norr-closed-beta-loader.js", import.meta.url)));
});
