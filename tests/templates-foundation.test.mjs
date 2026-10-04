import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { featuredTemplates, previewTemplates, templateRegistry } from "../lib/templates/registry.ts";

const workspaceSource = await readFile(new URL("../app/templates/[slug]/template-workspace.tsx", import.meta.url), "utf8");
const editorialWorkbenchSource = await readFile(new URL("../app/templates/[slug]/template-editorial-workbench.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("../app/templates/[slug]/page.tsx", import.meta.url), "utf8");
const generateRouteSource = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
const templateAssetsRouteSource = await readFile(new URL("../app/api/account/template-assets/route.ts", import.meta.url), "utf8");
const templatesCssSource = await readFile(new URL("../app/templates-foundation.css", import.meta.url), "utf8");

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
  const template = templateRegistry.find((item) => item.slug === "furniture-casting");
  assert.ok(template);
  assert.equal(template.status, "internal");
  assert.equal(template.resultType, "image_series");
  assert.deepEqual(template.inputSlots.map((slot) => slot.kind), ["room_image", "product_images"]);
  assert.equal(template.inputSlots[1].minCount, 1);
  assert.equal(template.inputSlots[1].maxCount, 5);
});

test("unsupported flows remain honest fixtures while the live workbench uses the existing endpoint", () => {
  assert.match(workspaceSource, /PREVIEW RESULT · AI НЕ ЗАПУСКАЛСЯ/);
  assert.match(editorialWorkbenchSource, /fetch\("\/api\/generate"/);
  assert.match(editorialWorkbenchSource, /Idempotency-Key/);
  assert.match(editorialWorkbenchSource, /operation: "place"/);
  assert.match(editorialWorkbenchSource, /furnitureCasting: \{ markedImage/);
  assert.match(editorialWorkbenchSource, /createPlacementGuideImage/);
  assert.match(editorialWorkbenchSource, /items: selectedImages\.map/);
  assert.match(editorialWorkbenchSource, /readFile\(file, 2048\)/);
  assert.match(editorialWorkbenchSource, /readFile\(file, 1280\)/);
  assert.match(generateRouteSource, /furnitureCastingPrompt/);
  assert.match(generateRouteSource, /referenceBlobs\.forEach/);
  assert.match(generateRouteSource, /providerInputImagesCount: diagnosticProviderInputImages/);
  assert.doesNotMatch(editorialWorkbenchSource, /createPlacementMask|placement: \{ \.\.\.placement, mask \}/);
  assert.match(workspaceSource, /!canRunReal && !realFurnitureFlow/);
  assert.match(workspaceSource, /fetch\("\/api\/projects"/);
  assert.match(detailSource, /generateStaticParams/);
  assert.doesNotMatch(`${workspaceSource}${editorialWorkbenchSource}`, /pipelineKey|OPENAI_API_KEY|providerSecret/);
});

test("editorial workbench uses one point per active image and one final generation", () => {
  assert.match(editorialWorkbenchSource, /Record<string, Point>/);
  assert.match(editorialWorkbenchSource, /placements\[image\.id\]/);
  assert.match(editorialWorkbenchSource, /setPlacingId/);
  assert.match(editorialWorkbenchSource, /\/api\/account\/generations/);
  assert.match(editorialWorkbenchSource, /setGenerationHistory/);
  assert.match(editorialWorkbenchSource, /generation\.prompt\.includes\(FINAL_RENDER_MARKER\)/);
  assert.match(editorialWorkbenchSource, /\[items:\$\{selectedImages\.length\}; \$\{FINAL_RENDER_MARKER\}\]/);
  assert.match(editorialWorkbenchSource, /const finalItem: GenerationItem/);
  assert.match(editorialWorkbenchSource, /setGenerationHistory\(\(current\) => \[finalItem/);
  assert.doesNotMatch(editorialWorkbenchSource, /Предметы добавляются последовательно/);
  assert.doesNotMatch(editorialWorkbenchSource, /setProgress|\$\{progress\}%/);
  assert.match(editorialWorkbenchSource, /elapsedSeconds/);
  assert.match(generateRouteSource, /body\.furnitureCasting \? 360_000 : 180_000/);
  assert.match(editorialWorkbenchSource, /Открыть готовый рендер/);
  assert.match(editorialWorkbenchSource, /title="История генераций"/);
  assert.doesNotMatch(editorialWorkbenchSource, /Provider usage|Стоимость Room Design|tokenCost|X-Room-AI/);
  assert.match(detailSource, /template-editorial-heading/);
});

test("changing workbench inputs preserves histories and keeps the draft visible", () => {
  assert.match(editorialWorkbenchSource, /setPlacements\(\{\}\);/);
  assert.match(editorialWorkbenchSource, /setEditingDraft\(true\)/);
  assert.match(editorialWorkbenchSource, /const nextPlacements = \{ \.\.\.placements, \[placingId\]: point \}/);
  assert.doesNotMatch(editorialWorkbenchSource, /setGenerationHistory\(\[\]\)|setSourceHistory\(\[\]\)/);
});

test("source history uses server media storage and active slots remain separate", () => {
  assert.match(editorialWorkbenchSource, /\/api\/account\/template-assets/);
  assert.match(templateAssetsRouteSource, /tenantStoragePrefix\(user\)/);
  assert.match(templateAssetsRouteSource, /storage\(\)\.put/);
  assert.match(editorialWorkbenchSource, /Array\.from\(\{ length: maxSlots \}/);
  assert.match(editorialWorkbenchSource, /removeActive/);
  assert.match(editorialWorkbenchSource, /addFromHistory/);
  assert.match(editorialWorkbenchSource, /Удалите одно из активных изображений/);
  assert.match(editorialWorkbenchSource, /scrollBy\(\{ left: direction/);
  assert.match(editorialWorkbenchSource, /event\.shiftKey/);
  assert.match(templatesCssSource, /\.editorial-history-viewport\{display:flex/);
  assert.match(templatesCssSource, /overflow-x:auto/);
  assert.match(templatesCssSource, /\.editorial-history-viewport>article\.is-selected/);
});

test("all selected points remain visible until generation starts", () => {
  assert.match(editorialWorkbenchSource, /showDraft && Object\.entries\(placements\)\.map/);
  assert.match(editorialWorkbenchSource, /setEditingDraft\(false\)/);
});
