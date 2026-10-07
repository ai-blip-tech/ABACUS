import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { featuredTemplates, previewTemplates, templateRegistry } from "../lib/templates/registry.ts";
import { templateWorkbenchScenarios } from "../lib/templates/workbench.ts";

const workspaceSource = await readFile(new URL("../app/templates/[slug]/template-workspace.tsx", import.meta.url), "utf8");
const editorialWorkbenchSource = await readFile(new URL("../app/templates/[slug]/template-editorial-workbench.tsx", import.meta.url), "utf8");
const scenarioWorkbenchSource = await readFile(new URL("../app/templates/[slug]/template-scenario-workbench.tsx", import.meta.url), "utf8");
const detailSource = await readFile(new URL("../app/templates/[slug]/page.tsx", import.meta.url), "utf8");
const generateRouteSource = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
const templateAssetsRouteSource = await readFile(new URL("../app/api/account/template-assets/route.ts", import.meta.url), "utf8");
const templatesCssSource = await readFile(new URL("../app/templates-foundation.css", import.meta.url), "utf8");
const templatesHomeSource = await readFile(new URL("../app/templates-home.tsx", import.meta.url), "utf8");
const templatesHomeCssSource = await readFile(new URL("../app/templates-home-v2.css", import.meta.url), "utf8");
const nextConfigSource = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

test("registry contains exactly thirty-four unique versioned templates", () => {
  assert.equal(templateRegistry.length, 34);
  assert.equal(new Set(templateRegistry.map((template) => template.id)).size, 34);
  assert.equal(new Set(templateRegistry.map((template) => template.slug)).size, 34);
  for (const removed of ["memory-room", "home-swap", "architectural-xray", "window-portal", "inside-the-walls", "house-awake"]) assert.equal(templateRegistry.some((template) => template.slug === removed), false);
  assert.deepEqual(templateRegistry.map((template) => template.sortOrder), Array.from({ length: 34 }, (_, index) => index + 1));
  assert.deepEqual(templateRegistry.slice(0, 6).map((template) => template.slug), ["design-battle", "light-scenarios", "furniture-casting", "use-what-you-have", "declutter", "moodboard-to-room"]);
  for (const template of templateRegistry) {
    assert.equal(template.version, 1);
    assert.ok(template.inputSlots.length > 0, `${template.slug} must have input slots`);
    assert.equal(template.preview.type, "placeholder");
    assert.match(template.preview.alt, /placeholder/i);
    assert.notEqual(template.status, "live", `${template.slug} must not be live before its quality gate`);
  }
});

test("foundation exposes all reviewable records and the approved featured mix", () => {
  assert.equal(previewTemplates.length, 34);
  assert.deepEqual(featuredTemplates.map((template) => template.slug), ["design-battle", "light-scenarios", "furniture-casting", "declutter", "moodboard-to-room", "material-preview", "next-chapter", "roast-my-room"]);
  assert.match(templatesHomeSource, /\["design-battle", "light-scenarios", "next-chapter", "moodboard-to-room"\]/);
});

test("homepage uses the approved Design Battle video preview", () => {
  assert.match(templatesHomeSource, /\/media\/templates\/design-battle-preview\.mp4/);
  assert.match(templatesHomeSource, /showVideoPreview=\{template\.slug === "design-battle"\}/);
  assert.match(templatesHomeSource, /prefers-reduced-motion: reduce/);
  assert.match(templatesHomeSource, /muted/);
  assert.match(templatesHomeSource, /playsInline/);
  assert.match(templatesHomeCssSource, /\.home-template-video-preview/);
});

test("homepage hero scrubs approved media with scroll and keeps accessible fallbacks", () => {
  assert.match(templatesHomeSource, /room-design-hero\.mp4/);
  assert.match(templatesHomeSource, /room-design-hero-poster\.png/);
  assert.match(templatesHomeSource, /video\.currentTime = targetTime/);
  assert.match(templatesHomeSource, /prefers-reduced-motion: reduce/);
  assert.match(templatesHomeSource, /connection\?\.saveData/);
  assert.match(templatesHomeSource, /muted/);
  assert.match(templatesHomeSource, /playsInline/);
  assert.match(templatesHomeSource, />Начать проект </);
  assert.doesNotMatch(templatesHomeSource, /Смотреть шаблоны/);
  assert.doesNotMatch(templatesHomeSource, /Начать создавать|ROOM DESIGN \/ 2026|EDITORIAL AI INTERIORS/);
  assert.match(templatesHomeSource, /<i aria-hidden="true" \/> ШАБЛОНЫ/);
  assert.doesNotMatch(templatesHomeSource, /01 \/ ROOM|02 \/ TRANSFORM|03 \/ RESULT|SCROLL TO TRANSFORM/);
  assert.match(templatesHomeSource, /Открыть все \{templateRegistry\.length\} шаблона/);
});

test("preview hides framework chrome and branded calls to action have visible feedback", () => {
  assert.match(nextConfigSource, /devIndicators:\s*false/);
  assert.match(templatesHomeCssSource, /templates-nav-actions>button:last-child:hover/);
  assert.match(templatesHomeCssSource, /templates-nav-actions>button:first-child:not\(:last-child\):hover/);
  assert.match(templatesHomeCssSource, /home-hero-overlay \.templates-hero-actions>button:hover/);
  assert.match(templatesHomeCssSource, /transform:translateY\(-3px\)/);
  assert.match(templatesHomeCssSource, /prefers-reduced-motion:reduce/);
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

test("all templates use an editorial workbench and every scenario is configured", () => {
  assert.deepEqual(Object.keys(templateWorkbenchScenarios).sort(), templateRegistry.map((template) => template.slug).sort());
  assert.match(workspaceSource, /TemplateEditorialWorkbench/);
  assert.match(workspaceSource, /TemplateScenarioWorkbench/);
  assert.doesNotMatch(workspaceSource, /GenericTemplateWorkspace|PREFLIGHT|AI НЕ ЗАПУСКАЛСЯ/);
  const battle = templateWorkbenchScenarios["design-battle"];
  assert.deepEqual(battle.outputLabels, ["Решение A", "Решение B"]);
  assert.match(battle.generationBrief, /два самостоятельных интерьерных решения/i);
});

test("light scenarios offers an exclusive preset-or-kelvin control and preserves the interior", () => {
  const template = templateRegistry.find((item) => item.slug === "light-scenarios");
  assert.ok(template);
  assert.deepEqual(template.requireAnyOf, [["lighting", "temperature"]]);
  assert.deepEqual(template.exclusiveValueGroups, [["lighting", "temperature"]]);
  const temperature = template.inputSlots.find((slot) => slot.id === "temperature");
  assert.equal(temperature?.kind, "range");
  assert.equal(temperature?.range?.min, 2200);
  assert.equal(temperature?.range?.max, 6500);
  assert.deepEqual(temperature?.range?.presets.map((preset) => preset.value), [2200, 2700, 3000, 3500, 4000, 5000, 6500]);
  assert.match(templateWorkbenchScenarios["light-scenarios"].generationBrief, /Строго сохранить интерьер, архитектуру, геометрию, мебель, материалы, декор, композицию/);
  assert.match(scenarioWorkbenchSource, /editorial-range-control/);
  assert.match(scenarioWorkbenchSource, /exclusiveValueGroups/);
});

test("scenario image upload remains clickable across browsers and accepts common JPEG metadata variants", () => {
  assert.match(scenarioWorkbenchSource, /type === "image\/jpg" \|\| type === "image\/pjpeg"/);
  assert.match(scenarioWorkbenchSource, /imageTypeByExtension/);
  assert.match(scenarioWorkbenchSource, /accept=\{acceptedFileTypes\(slot\)\}/);
  assert.match(scenarioWorkbenchSource, /aria-label=\{slot\.label\}/);
  assert.match(templatesCssSource, /\.editorial-dynamic-add input\{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer\}/);
  assert.doesNotMatch(templatesCssSource, /\.editorial-dynamic-add input\{[^}]*pointer-events:none/);
});

test("furniture casting keeps its specialized endpoint and other image scenarios use the additive template adapter", () => {
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
  assert.match(scenarioWorkbenchSource, /templateEdit: \{/);
  assert.match(scenarioWorkbenchSource, /operation: "global_edit"/);
  assert.match(scenarioWorkbenchSource, /Promise\.all\(labels\.map/);
  assert.match(scenarioWorkbenchSource, /validationErrors/);
  assert.match(scenarioWorkbenchSource, /История материалов/);
  assert.match(scenarioWorkbenchSource, /История генераций/);
  assert.match(generateRouteSource, /templateEditPrompt/);
  assert.match(generateRouteSource, /diagnosticBranch === "template_edit"/);
  assert.match(generateRouteSource, /template-reference-/);
  assert.match(detailSource, /generateStaticParams/);
  assert.doesNotMatch(`${workspaceSource}${editorialWorkbenchSource}${scenarioWorkbenchSource}`, /pipelineKey|OPENAI_API_KEY|providerSecret/);
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
  assert.match(editorialWorkbenchSource, /draggable=\{!selected && !full\}/);
  assert.match(editorialWorkbenchSource, /onDrop=\{\(event\) => dropHistoryAsset/);
  assert.match(editorialWorkbenchSource, /fetch\("\/api\/account\/template-assets"\)/);
  assert.match(scenarioWorkbenchSource, /draggable onDragStart/);
  assert.match(scenarioWorkbenchSource, /onDrop=\{\(event\) => dropHistoryAsset/);
  assert.match(scenarioWorkbenchSource, /fetch\("\/api\/account\/template-assets"\)/);
  assert.match(editorialWorkbenchSource, /Удалите одно из активных изображений/);
  assert.match(editorialWorkbenchSource, /scrollBy\(\{ left: direction/);
  assert.match(editorialWorkbenchSource, /event\.shiftKey/);
  assert.match(templatesCssSource, /\.editorial-history-viewport\{display:flex/);
  assert.match(templatesCssSource, /overflow-x:auto/);
  assert.match(templatesCssSource, /\.editorial-history-viewport>article\.is-selected/);
  assert.match(templatesCssSource, /\.editorial-dynamic-files\.is-drop-active/);
});

test("all selected points remain visible until generation starts", () => {
  assert.match(editorialWorkbenchSource, /showDraft && Object\.entries\(placements\)\.map/);
  assert.match(editorialWorkbenchSource, /setEditingDraft\(false\)/);
});

test("multi-result templates open one keyboard-accessible lightbox gallery", () => {
  assert.match(scenarioWorkbenchSource, /type LightboxState = \{ items: GenerationItem\[\]; index: number \}/);
  assert.match(scenarioWorkbenchSource, /batchId/);
  assert.match(scenarioWorkbenchSource, /event\.key === "ArrowLeft"/);
  assert.match(scenarioWorkbenchSource, /event\.key === "ArrowRight"/);
  assert.match(scenarioWorkbenchSource, /aria-label="Предыдущий результат"/);
  assert.match(scenarioWorkbenchSource, /aria-label="Следующий результат"/);
  assert.match(scenarioWorkbenchSource, /lightbox\.index \+ 1/);
  assert.match(templatesCssSource, /\.editorial-lightbox-nav\.is-previous/);
  assert.match(templatesCssSource, /\.editorial-lightbox-caption/);
});

test("every template result lightbox offers a named image download", () => {
  assert.match(editorialWorkbenchSource, /className="editorial-lightbox-download"/);
  assert.match(editorialWorkbenchSource, /download=\{`room-design-\$\{template\.slug\}-\$\{lightbox\.id\}\.webp`\}/);
  assert.match(scenarioWorkbenchSource, /className="editorial-lightbox-download"/);
  assert.match(scenarioWorkbenchSource, /lightbox\.items\[lightbox\.index\]\.id/);
  assert.match(scenarioWorkbenchSource, /aria-label="Скачать выбранный результат"/);
  assert.match(editorialWorkbenchSource, /className="history-download-icon"/);
  assert.match(scenarioWorkbenchSource, /className="history-download-icon"/);
  assert.doesNotMatch(`${editorialWorkbenchSource}${scenarioWorkbenchSource}`, />⇩ <span>Скачать<\/span>/);
  assert.match(templatesCssSource, /\.editorial-lightbox-download\{/);
});
