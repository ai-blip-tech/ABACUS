import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { featuredTemplates, previewTemplates, templateRegistry } from "../lib/templates/registry.ts";

const workspaceSource = await readFile(new URL("../app/templates/[slug]/template-workspace.tsx", import.meta.url), "utf8");
const furnitureWorkspaceSource = await readFile(new URL("../app/templates/[slug]/furniture-casting-workspace.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("../app/templates/[slug]/page.tsx", import.meta.url), "utf8");

test("registry contains exactly forty unique versioned templates", () => {
  assert.equal(templateRegistry.length, 40);
  assert.equal(new Set(templateRegistry.map((template) => template.id)).size, 40);
  assert.equal(new Set(templateRegistry.map((template) => template.slug)).size, 40);
  assert.deepEqual(templateRegistry.map((template) => template.sortOrder), Array.from({ length: 40 }, (_, index) => index + 1));
  for (const template of templateRegistry) {
    assert.equal(template.version, 1);
    assert.ok(template.inputSlots.length > 0, `${template.slug} must have input slots`);
    assert.equal(template.preview.type, "placeholder");
    assert.match(template.preview.alt, /placeholder/i);
    assert.notEqual(template.status, "live", `${template.slug} must not be live before its quality gate`);
  }
});

test("foundation exposes all reviewable records and the approved featured mix", () => {
  assert.equal(previewTemplates.length, 40);
  assert.deepEqual(featuredTemplates.map((template) => template.id), ["01", "03", "04", "07", "11", "12"]);
});

test("furniture casting has the approved room plus one-to-five product schema", () => {
  const furniture = templateRegistry.find((template) => template.slug === "furniture-casting");
  assert.ok(furniture);
  assert.equal(furniture.status, "internal");
  assert.equal(furniture.resultType, "image_series");
  assert.deepEqual(furniture.inputSlots.map((slot) => slot.kind), ["room_image", "product_images"]);
  assert.equal(furniture.inputSlots[1].minCount, 1);
  assert.equal(furniture.inputSlots[1].maxCount, 5);
});

test("unsupported flows remain honest fixtures while furniture uses the existing real endpoint", () => {
  assert.match(workspaceSource, /PREVIEW RESULT · AI НЕ ЗАПУСКАЛСЯ/);
  assert.match(furnitureWorkspaceSource, /fetch\("\/api\/generate"/);
  assert.match(furnitureWorkspaceSource, /Idempotency-Key/);
  assert.match(furnitureWorkspaceSource, /operation: "place"/);
  assert.match(furnitureWorkspaceSource, /pointEdit: \{ \.\.\.placement, markedImage \}/);
  assert.match(furnitureWorkspaceSource, /let currentRoom = room\.dataUrl/);
  assert.match(furnitureWorkspaceSource, /currentRoom = await blobToDataUrl/);
  assert.doesNotMatch(furnitureWorkspaceSource, /createPlacementMask|placement: \{ \.\.\.placement, mask \}/);
  assert.match(workspaceSource, /!canRunReal && !realFurnitureFlow/);
  assert.match(workspaceSource, /fetch\("\/api\/projects"/);
  assert.match(detailSource, /generateStaticParams/);
  assert.doesNotMatch(`${workspaceSource}${furnitureWorkspaceSource}`, /pipelineKey|OPENAI_API_KEY|providerSecret/);
});

test("furniture casting uses one point per product and keeps a consumer-facing generation history", () => {
  assert.match(furnitureWorkspaceSource, /Record<string, Point>/);
  assert.match(furnitureWorkspaceSource, /placements\[product\.id\]/);
  assert.match(furnitureWorkspaceSource, /setPlacingProductId/);
  assert.match(furnitureWorkspaceSource, /\/api\/account\/generations/);
  assert.match(furnitureWorkspaceSource, /setHistory/);
  assert.match(furnitureWorkspaceSource, /Открыть готовый рендер на весь экран/);
  assert.match(furnitureWorkspaceSource, /ИСТОРИЯ ГЕНЕРАЦИЙ/);
  assert.doesNotMatch(furnitureWorkspaceSource, /Provider usage|Стоимость Room Design|tokenCost|X-Room-AI/);
  assert.match(detailSource, /!isFurnitureCasting && <div className="template-detail-media">/);
});
