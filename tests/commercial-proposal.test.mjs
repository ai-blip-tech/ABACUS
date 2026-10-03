import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildProposalProducts, proposalTotal } from "../lib/commercial-proposal.ts";

const catalog = new Map([["catalog-1", {
  id: "catalog-1", name: "Каталожный диван", image: "https://example.com/sofa.jpg", images: [],
  price: 100000, widthMm: 2200, depthMm: 900, heightMm: 760,
}]]);

test("commercial proposal groups catalog quantity and keeps overrides project-local", () => {
  const products = buildProposalProducts([
    { id: "a", kind: "sofa", name: "Диван", width: 2000, depth: 800, referenceImage: "old.jpg", referenceProductId: "catalog-1", proposalOverride: { price: 90000, name: "Диван для клиента" } },
    { id: "b", kind: "sofa", name: "Диван", width: 2000, depth: 800, referenceImage: "old.jpg", referenceProductId: "catalog-1" },
  ], catalog);
  assert.equal(products.length, 1);
  assert.equal(products[0].quantity, 2);
  assert.deepEqual(products[0].objectIds, ["a", "b"]);
  assert.equal(products[0].price, 90000);
  assert.equal(products[0].name, "Диван для клиента");
  assert.equal(catalog.get("catalog-1").price, 100000);
});

test("commercial proposal includes reference-only products and saved metadata", () => {
  const [product] = buildProposalProducts([{
    id: "reference-chair", kind: "chair", name: "Кресло", width: 800, depth: 800,
    referenceImage: "data:image/png;base64,AA==", referenceName: "Моё кресло",
    proposalOverride: { name: "Кресло Custom", height: 750, price: 75000, notes: "Букле, производство Италия" },
  }]);
  assert.equal(product.source, "reference");
  assert.equal(product.image, "data:image/png;base64,AA==");
  assert.equal(product.name, "Кресло Custom");
  assert.equal(product.height, 750);
  assert.equal(product.price, 75000);
  assert.equal(product.notes, "Букле, производство Италия");
});

test("commercial proposal total uses override price and quantity", () => {
  const products = buildProposalProducts([
    { id: "a", kind: "sofa", name: "Диван", width: 1, depth: 1, referenceImage: "a", referenceProductId: "catalog-1", proposalOverride: { price: 90000 } },
    { id: "b", kind: "sofa", name: "Диван", width: 1, depth: 1, referenceImage: "a", referenceProductId: "catalog-1" },
    { id: "c", kind: "chair", name: "Кресло", width: 1, depth: 1, referenceImage: "b", proposalOverride: { price: 75000 } },
  ], catalog);
  assert.equal(proposalTotal(products), 255000);
});

test("proposal endpoints enforce auth, ownership and byte-based image detection", async () => {
  const [pdfRoute, metadataRoute] = await Promise.all([
    readFile(new URL("../app/api/proposal/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/projects/[id]/proposal/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(pdfRoute, /requireTenantUser\(request\)/);
  assert.match(pdfRoute, /tenant_id = \? AND user_id = \?/);
  assert.match(pdfRoute, /allowedObjectIds/);
  assert.match(pdfRoute, /normalizeProposalImage/);
  assert.match(metadataRoute, /tenant_id = \? AND user_id = \?/);
});
