import assert from "node:assert/strict";
import test from "node:test";
import {
  NORR_PRODUCT_HANDOFF_TTL_MS,
  norrProductIdFromSearch,
  norrProductIdFromStorage,
  serializeNorrProductHandoff,
  validNorrProductId,
} from "../lib/norr-product-handoff.ts";

test("a NORR catalog identifier is accepted only from the canonical query parameter", () => {
  assert.equal(norrProductIdFromSearch("?norrProduct=NRM00165"), "NRM00165");
  assert.equal(norrProductIdFromSearch("?product=NRM00165"), "");
  assert.equal(validNorrProductId("../../etc/passwd"), "");
  assert.equal(validNorrProductId("NRM-00165:oak.v2"), "NRM-00165:oak.v2");
});

test("a pending product survives login navigation for at most 24 hours", () => {
  const now = 2_000_000_000_000;
  const stored = serializeNorrProductHandoff("NRM00165", now);
  assert.equal(norrProductIdFromStorage(stored, now + NORR_PRODUCT_HANDOFF_TTL_MS), "NRM00165");
  assert.equal(norrProductIdFromStorage(stored, now + NORR_PRODUCT_HANDOFF_TTL_MS + 1), "");
  assert.equal(norrProductIdFromStorage("not-json", now), "");
});

test("the Room Design entry flow preselects but never auto-submits the product", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../app/page.tsx", import.meta.url), "utf8"));
  const handoffEffect = source.match(/const fromUrl=norrProductIdFromSearch[\s\S]*?return\(\)=>controller\.abort\(\);/)?.[0] || "";
  assert.match(handoffEffect, /fetch\(`\/api\/catalog\?ids=/);
  assert.match(handoffEffect, /setReferenceImage\(product\.image\)/);
  assert.match(handoffEffect, /setView\("studio"\)/);
  assert.doesNotMatch(handoffEffect, /\/api\/generate|generate\(/);
});
