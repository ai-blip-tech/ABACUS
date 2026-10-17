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
const templateCardSource = await readFile(new URL("../app/templates/template-card.tsx", import.meta.url), "utf8");
const templatePreviewMediaSource = await readFile(new URL("../app/template-preview-media.tsx", import.meta.url), "utf8");
const templatesHomeCssSource = await readFile(new URL("../app/templates-home-v2.css", import.meta.url), "utf8");
const nextConfigSource = await readFile(new URL("../next.config.ts", import.meta.url), "utf8");

test("registry contains exactly thirty-four unique versioned templates", () => {
  assert.equal(templateRegistry.length, 34);
  assert.equal(new Set(templateRegistry.map((template) => template.id)).size, 34);
  assert.equal(new Set(templateRegistry.map((template) => template.slug)).size, 34);
  for (const removed of ["memory-room", "home-swap", "architectural-xray", "window-portal", "inside-the-walls", "house-awake", "declutter", "next-chapter"]) assert.equal(templateRegistry.some((template) => template.slug === removed), false);
  assert.deepEqual(templateRegistry.map((template) => template.sortOrder), Array.from({ length: 34 }, (_, index) => index + 1));
  assert.deepEqual(templateRegistry.slice(0, 6).map((template) => template.slug), ["planogram-3d", "design-battle", "light-scenarios", "moodboard-to-room", "use-what-you-have", "furniture-casting"]);
  for (const template of templateRegistry) {
    assert.equal(template.version, 1);
    assert.ok(template.inputSlots.length > 0, `${template.slug} must have input slots`);
    assert.ok(["placeholder", "image", "video"].includes(template.preview.type));
    assert.ok(template.preview.src);
    assert.notEqual(template.status, "live", `${template.slug} must not be live before its quality gate`);
  }
});

test("foundation exposes all reviewable records and the approved featured mix", () => {
  assert.equal(previewTemplates.length, 34);
  assert.deepEqual(featuredTemplates.map((template) => template.slug), ["planogram-3d", "design-battle", "light-scenarios", "moodboard-to-room", "furniture-casting", "material-preview", "roast-my-room", "kitchen-cad-to-photo"]);
  assert.match(templatesHomeSource, /\["planogram-3d", "design-battle", "light-scenarios", "moodboard-to-room", "kitchen-cad-to-photo"\]/);
  assert.match(templatesHomeSource, /featured\.filter\(\(_, index\) => index % 2 === 0\)/);
  assert.match(templatesHomeSource, /featured\.filter\(\(_, index\) => index % 2 === 1\)/);
  assert.match(templatesHomeSource, /matchMedia\("\(max-width: 760px\)"\)/);
  assert.match(templatesHomeCssSource, /\.home-featured-column\{[^}]*flex-direction:column[^}]*gap:12px/);
});

test("homepage and catalog share video-capable template previews", () => {
  const battle = templateRegistry.find((template) => template.slug === "design-battle");
  assert.equal(battle?.preview.type, "video");
  assert.equal(battle?.preview.videoSrc, "/media/templates/design-battle-preview.mp4");

  const lightScenarios = templateRegistry.find((template) => template.slug === "light-scenarios");
  assert.equal(lightScenarios?.preview.type, "video");
  assert.equal(lightScenarios?.preview.videoSrc, "/media/templates/light-scenarios-preview.mp4");
  assert.match(templatesHomeSource, /TemplatePreviewMedia/);
  assert.match(templateCardSource, /TemplatePreviewMedia/);
  assert.match(templatePreviewMediaSource, /prefers-reduced-motion: reduce/);
  assert.match(templatePreviewMediaSource, /IntersectionObserver/);
  assert.match(templatePreviewMediaSource, /muted/);
  assert.match(templatePreviewMediaSource, /playsInline/);
  assert.match(templatePreviewMediaSource, /poster=\{preview\.src\}/);
  assert.match(templatesHomeCssSource, /\.home-template-media-preview/);
  assert.doesNotMatch(templatesHomeSource, /VIDEO PREVIEW|VIDEO ASSET SLOT/);
  assert.doesNotMatch(templateCardSource, /status-|template-status-label|template-fixture-label|ВИДЕО СКОРО|Посмотреть preview/);
  assert.match(templatesCssSource, /\.template-catalog-preview\{[^}]*filter:none/);
});

test("all templates without approved video or custom cover share the blueprint placeholder", () => {
  const excludedSlugs = new Set(["design-battle", "light-scenarios", "moodboard-to-room", "furniture-casting", "planogram-3d"]);
  const placeholderTemplates = templateRegistry.filter((template) => !excludedSlugs.has(template.slug));

  assert.equal(placeholderTemplates.length, 29);
  for (const template of placeholderTemplates) {
    assert.equal(template.preview.type, "placeholder", template.slug);
    assert.equal(template.preview.src, "/project-loading-blueprint.png", template.slug);
  }

  for (const slug of ["design-battle", "light-scenarios", "moodboard-to-room"]) {
    assert.equal(templateRegistry.find((template) => template.slug === slug)?.preview.type, "video", slug);
  }
  assert.equal(templateRegistry.find((template) => template.slug === "furniture-casting")?.preview.src, "/media/templates/furniture-casting-cover.png");
});

test("homepage mounts the live Ono hero and keeps one project call to action", () => {
  assert.doesNotMatch(templatesHomeSource, /room-design-hero\.mp4|room-design-hero-poster\.png|ScrollScrubHero/);
  assert.match(templatesHomeSource, /id="home-ono-slot"/);
  assert.match(templatesHomeSource, /«ОНО» — ваш ИИ-ассистент/);
  assert.match(templatesHomeSource, /С чего начнём\?/);
  assert.match(templatesHomeSource, /ПРОЕКТНАЯ СРЕДА/);
  assert.match(templatesHomeSource, /Не отдельный рендер/);
  assert.equal((templatesHomeSource.match(/>Начать проект /g) || []).length, 1);
  assert.doesNotMatch(templatesHomeSource, /Смотреть шаблоны/);
  assert.doesNotMatch(templatesHomeSource, /Начать создавать|ROOM DESIGN \/ 2026|EDITORIAL AI INTERIORS/);
  assert.match(templatesHomeSource, /<i aria-hidden="true" \/> ШАБЛОНЫ/);
  assert.doesNotMatch(templatesHomeSource, /home-audience-switch/);
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
  assert.equal(template.preview.type, "image");
  assert.equal(template.preview.src, "/media/templates/furniture-casting-cover.png");
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

test("planogram 3D has a real floor-plan generation flow with immutable architecture", () => {
  const template = templateRegistry.find((item) => item.slug === "planogram-3d");
  assert.ok(template);
  assert.equal(templateRegistry[0].slug, "planogram-3d");
  assert.equal(template.sortOrder, 1);
  assert.equal(template.featured, true);
  assert.equal(template.preview.type, "image");
  assert.equal(template.preview.src, "/media/templates/planogram-3d-cover.png");
  assert.deepEqual(template.badges, ["НОВИНКА"]);
  assert.match(templateCardSource, /template-new-badge/);
  assert.match(templatesHomeSource, /template-new-badge/);
  assert.match(templatesCssSource, /\.template-new-badge/);
  assert.equal(template.title, "Планограмма 3D");
  assert.equal(template.status, "internal");
  assert.equal(template.safetyPolicy, "floor-plan-lock");
  assert.equal(template.inputSlots[0].kind, "floor_plan");
  assert.equal(template.inputSlots[0].required, true);
  assert.equal(template.inputSlots.find((slot) => slot.id === "references")?.maxCount, 10);
  assert.equal(template.inputSlots.find((slot) => slot.id === "style")?.defaultValue, "Современный");
  assert.equal(template.inputSlots.find((slot) => slot.id === "resultFormat")?.defaultValue, "Как исходник");
  assert.match(templateWorkbenchScenarios["planogram-3d"].generationBrief, /FLOOR PLAN LOCK/);
  assert.match(templateWorkbenchScenarios["planogram-3d"].generationBrief, /строго сверху/i);
  assert.match(templateWorkbenchScenarios["planogram-3d"].generationBrief, /мысленно удалить все тонкие дуги/);
  assert.match(templateWorkbenchScenarios["planogram-3d"].generationBrief, /все двери показывать закрытыми/);
  assert.match(scenarioWorkbenchSource, /isPlanogram3D/);
  assert.match(scenarioWorkbenchSource, /slot\.defaultValue/);
  assert.match(scenarioWorkbenchSource, /planogramOutputSize/);
  assert.match(scenarioWorkbenchSource, /MANDATORY STYLE/);
  assert.match(scenarioWorkbenchSource, /values\.furnishing/);
  assert.match(scenarioWorkbenchSource, /values\.existingFurniture/);
  assert.match(scenarioWorkbenchSource, /values\.lighting/);
  assert.match(scenarioWorkbenchSource, /values\.atmosphere/);
  assert.match(scenarioWorkbenchSource, /values\.peopleCount/);
  assert.match(scenarioWorkbenchSource, /values\.peopleBehavior/);
  assert.match(scenarioWorkbenchSource, /Do not omit them/);
  assert.match(scenarioWorkbenchSource, /planogram-3d-comparison/);
  assert.match(scenarioWorkbenchSource, /Этот шаблон сохраняет исходную планировку/);
  assert.match(generateRouteSource, /isPlanogram3D/);
  assert.match(generateRouteSource, /IMAGE 1 IS THE AUTHORITATIVE FLOOR PLAN/);
  assert.match(generateRouteSource, /strict 90-degree bird's-eye top-down view/);
  assert.match(generateRouteSource, /MANDATORY ARCHITECTURAL DOOR-SYMBOL PARSING/);
  assert.match(generateRouteSource, /render ALL door leaves CLOSED and FLUSH/);
  assert.match(generateRouteSource, /Every structured control in the user brief is mandatory/);
  assert.match(generateRouteSource, /Otherwise render the requested number or range of people/);
  assert.match(generateRouteSource, /FINAL DOOR QA IS NON-NEGOTIABLE/);
  assert.doesNotMatch(scenarioWorkbenchSource, /isPlanogram3D \? "FLOOR PLAN LOCK/);
  assert.match(templatesCssSource, /\.planogram-3d-comparison/);
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

test("moodboard template supports room transfer and a sixteen-reference editorial composition mode", () => {
  const template = templateRegistry.find((item) => item.slug === "moodboard-to-room");
  assert.ok(template);
  assert.equal(template.status, "internal");
  assert.match(template.inputSummary, /16 материалов/);
  assert.match(scenarioWorkbenchSource, /type MoodboardMode = "room" \| "compose"/);
  assert.match(scenarioWorkbenchSource, /maxCount: 16/);
  assert.match(scenarioWorkbenchSource, /Собрать мудборд/);
  assert.match(scenarioWorkbenchSource, /moodboard-builder/);
  assert.match(scenarioWorkbenchSource, /1024x1536/);
  assert.match(generateRouteSource, /isMoodboardComposition/);
  assert.match(generateRouteSource, /Images 1–\$\{templateReferenceImages\.length \+ 1\} are equal material and visual references/);
  assert.match(generateRouteSource, /never substitute or invent a material/);
  assert.match(generateRouteSource, /maxTemplateReferenceImages = isMoodboardComposition \? 15 : 10/);
  assert.match(templatesCssSource, /\.editorial-mode-switch/);
  assert.match(templatesCssSource, /\.editorial-result-stage\.is-moodboard-stage/);
});

test("moodboard uses its approved video as a catalog and homepage cover, not inside the workspace", () => {
  const template = templateRegistry.find((item) => item.slug === "moodboard-to-room");
  assert.equal(template?.preview.type, "video");
  assert.equal(template?.preview.videoSrc, "/media/templates/moodboard-to-room-hero.mp4");
  assert.equal(template?.preview.src, "/media/templates/moodboard-to-room-hero-poster.png");
  assert.doesNotMatch(detailSource, /TemplatePreviewMedia|preview\.videoSrc/);
  assert.match(templateCardSource, /TemplatePreviewMedia/);
  assert.match(templatesHomeSource, /TemplatePreviewMedia/);
});

test("kitchen CAD preview enforces required materials and Geometry Lock", () => {
  const template = templateRegistry.find((item) => item.slug === "kitchen-cad-to-photo");
  assert.ok(template);
  assert.equal(template.status, "internal");
  assert.equal(template.audience, "professional");
  assert.equal(template.resultType, "image");
  assert.equal(template.safetyPolicy, "geometry-lock");
  assert.equal(template.ctaLabel, "Создать визуал");
  assert.deepEqual(template.requireAnyOf, [["backsplashMaterial", "backsplashColor"]]);
  assert.deepEqual(template.inputSlots.filter((slot) => slot.required).map((slot) => slot.id), ["kitchenCad", "facadeMaterials", "countertopMaterial"]);
  const facadeMaterials = template.inputSlots.find((slot) => slot.id === "facadeMaterials");
  assert.equal(facadeMaterials?.minCount, 1);
  assert.equal(facadeMaterials?.maxCount, 4);
  assert.equal(template.inputSlots.find((slot) => slot.id === "appliances")?.maxCount, 4);
  assert.match(templateWorkbenchScenarios["kitchen-cad-to-photo"].generationBrief, /GEOMETRY LOCK/);
  assert.match(templateWorkbenchScenarios["kitchen-cad-to-photo"].generationBrief, /Строго сохранить исходную камеру и композицию/);
  assert.match(scenarioWorkbenchSource, /hasGeometryLockConflict/);
  assert.match(scenarioWorkbenchSource, /GEOMETRY LOCK · ВКЛЮЧЁН/);
  assert.match(scenarioWorkbenchSource, /назначение поверхностей подтверждается вручную/);
  assert.match(scenarioWorkbenchSource, /surfacePointColors = \["#2f8f5b", "#2f69b0"/);
  assert.match(scenarioWorkbenchSource, /addSurfacePoint/);
  assert.match(scenarioWorkbenchSource, /Фактура фасадов \$\{index \+ 1\}: поставьте хотя бы одну/);
  assert.match(scenarioWorkbenchSource, /Supporting Image \$\{referenceIndex \+ 2\}/);
  assert.match(scenarioWorkbenchSource, /normalized source-image coordinates/);
  assert.match(templatesCssSource, /\.editorial-geometry-lock/);
  assert.match(templatesCssSource, /\.editorial-surface-point/);
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
  assert.match(generateRouteSource, /body\.furnitureCasting \|\| isMoodboardComposition \? 360_000 : 180_000/);
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

test("every template result lightbox converts its download to JPEG", () => {
  assert.match(editorialWorkbenchSource, /className="editorial-lightbox-download"/);
  assert.match(editorialWorkbenchSource, /downloadImageAsJpeg\(lightbox\.dataUrl, `room-design-\$\{template\.slug\}-\$\{lightbox\.id\}`\)/);
  assert.match(scenarioWorkbenchSource, /className="editorial-lightbox-download"/);
  assert.match(scenarioWorkbenchSource, /downloadImageAsJpeg\(item\.dataUrl, `room-design-\$\{template\.slug\}-\$\{item\.id\}`\)/);
  assert.match(scenarioWorkbenchSource, /aria-label="Скачать выбранный результат в JPEG"/);
  assert.match(editorialWorkbenchSource, /className="history-download-icon"/);
  assert.match(scenarioWorkbenchSource, /className="history-download-icon"/);
  assert.doesNotMatch(`${editorialWorkbenchSource}${scenarioWorkbenchSource}`, /download=\{[^}]*\.webp/);
  assert.doesNotMatch(`${editorialWorkbenchSource}${scenarioWorkbenchSource}`, />⇩ <span>Скачать<\/span>/);
  assert.match(templatesCssSource, /\.editorial-lightbox-download\{/);
});
