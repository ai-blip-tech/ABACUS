import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/unified-studio-preview.css", import.meta.url), "utf8");
const generateRoute = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
const discovery = await readFile(new URL("../docs/unified-studio-preview-discovery.md", import.meta.url), "utf8");

test("unified studio is the production default with an explicit legacy rollback flag", () => {
  assert.match(page, /useState\(true\)/);
  assert.match(page, /params\.get\("studioPreview"\) !== "legacy"/);
  assert.match(page, /unifiedStudioPreview \?/);
  assert.match(page, /unified-studio-preview/);
});

test("unified studio replaces obsolete project navigation with source materials", () => {
  assert.match(page, /studio-source-rail/);
  assert.match(page, /ИСХОДНОЕ ИЗОБРАЖЕНИЕ/);
  assert.match(page, /Добавить исходное изображение/);
  assert.match(page, /Добавить из референса/);
  assert.match(page, /ВДОХНОВЕНИЕ/);
  assert.match(page, /ПРЕВРАЩАЕТ ПРОСТРАНСТВО/);
  assert.match(page, /Технический свет Beta/);
});

test("mode switch is an accessible tablist that reuses the existing active tool state", () => {
  assert.match(page, /role="tablist"/);
  assert.match(page, /role="tab" aria-selected=\{studioMode==="image"\}/);
  assert.match(page, /role="tab" aria-selected=\{studioMode==="plan"\}/);
  assert.match(page, /setActiveTool\("Планограмма"\)/);
  assert.match(page, /setActiveTool\(imageStudioTool === "Планограмма" \? "Добавить мебель" : imageStudioTool\)/);
});

test("project actions call the established handlers instead of placeholder actions", () => {
  assert.match(page, /onClick=\{\(\)=>void openCommercialProposal\(\)\}/);
  assert.match(page, /onClick=\{\(\)=>setFavorite\(!favorite\)\}/);
  assert.match(page, /onClick=\{\(\)=>void saveProject\(\)\}/);
  assert.match(page, /const selectedHistoryVersion =/);
  assert.match(page, /downloadHistoryVersion\(selectedHistoryVersion\)/);
});

test("preview header keeps one working upscale action and uses the full account control", () => {
  assert.match(page, /!unifiedStudioPreview&&<button className="help"/);
  assert.match(page, /<AccountDropdown user=\{user\} studio=\{!unifiedStudioPreview\}/);
  assert.match(page, /className="studio-upscale-icon"/);
  assert.match(page, /onClick=\{\(\)=>void upscaleHistoryVersion\(\)\}/);
  assert.match(page, /studioMode==="plan"&&<button type="button" onClick=\{\(\)=>setStudioDrawer/);
  assert.match(page, />Параметры<\/button>/);
  assert.match(page, /!unifiedStudioPreview&&studioMode==="image"&&<button/);
  assert.match(page, /aria-label="Инструменты редактирования"/);
  assert.match(page, /!unifiedStudioPreview&&<button type="button" onClick=\{\(\)=>setFavorite/);
  assert.match(page, /!unifiedStudioPreview&&<button type="button" disabled=\{!selectedHistoryVersion\}/);
  assert.match(css, /studio-upscale-action[\s\S]*border-color: #ded2c5/);
  assert.match(css, /studio-upscale-action[\s\S]*height: 40px[\s\S]*gap: 4px/);
  assert.match(css, /studio-upscale-action \{ min-width: 108px; width: auto; height: 36px; gap: 4px/);
  assert.match(css, /top-actions \.account-trigger[\s\S]*border-radius: 999px/);
});

test("image editor uses a contextual point menu and preserves advanced tools", () => {
  assert.match(page, /studio-point-menu/);
  assert.match(page, /Действия в выбранной точке/);
  assert.match(page, /removeAtPlacement\(placementPoint\)/);
  assert.match(page, /Каталог, референс и текстовая правка/);
  assert.match(page, /ЧТО ИЗМЕНИТЬ\?/);
  assert.match(page, /upscaleHistoryVersion/);
  assert.match(page, /material-brush-trigger/);
  assert.match(page, /orbitAction/);
  assert.match(page, /orbitSuppressedAction/);
  assert.match(page, /orbitAction===action\?null:action/);
  assert.match(page, /studioOrbit=placementPoint\.x<22\?"right"/);
  assert.match(page, /createPortal\(<button className="studio-canvas-render-button"/);
  assert.match(page, /disabled=\{!catalogCanGenerate\}/);
  assert.match(page, /const selectedEdit=queuedEdits\[0\]/);
  assert.match(page, /selectedEdit\?\.product\.id===product\.id/);
  assert.match(page, /previousOrbitAction\.current!==orbitAction/);
  assert.match(page, /selectedProductIds=\{queuedEdits\.map/);
  assert.match(page, /studio-canvas-generation-error/);
  assert.match(page, /Выберите режим «Добавить» или «Заменить»/);
  assert.match(css, /data-studio-mode="image"\] \.inspector-title \{ display: none/);
});

test("one point owns one active product and references stay reusable", () => {
  assert.match(page, /setFurnitureEdits\(\[\{id:`edit-/);
  assert.doesNotMatch(page, /for \(const edit of furnitureEdits\)/);
  assert.match(page, /const edit=furnitureEdits\[0\]/);
  assert.match(page, /referenceSelected\?"studio-material-card active":"studio-material-card"/);
  assert.match(page, /aria-pressed=\{referenceSelected\}/);
  assert.match(page, /onClick=\{selectReference\}/);
  assert.match(page, /referenceSelected&&<section className="studio-source-section studio-reference-settings"/);
  assert.match(page, /referenceSelected&&referenceReady/);
  assert.doesNotMatch(page, /setReferenceImage\(""\); setReferenceName\(""\)/);
});

test("saved image instruction can render alone and reaches combined provider prompts", () => {
  assert.match(page, /setPlacementPrompt\(next\)/);
  assert.match(page, /else if\(placementPrompt\.trim\(\)\)onAdjust\(\)/);
  assert.match(page, /:instructionReady;/);
  assert.match(page, /additionalInstruction:imageInstruction\|\|undefined/);
  assert.match(generateRoute, /const additionalInstructionPrompt = additionalInstruction/);
  assert.match(generateRoute, /MANDATORY SIMULTANEOUS USER CHANGE/);
  assert.match(generateRoute, /form\.append\("prompt", replacementPrompt\)/);
  assert.match(generateRoute, /form\.append\("prompt", editPrompt\)/);
  assert.match(generateRoute, /form\.append\("prompt", globalEditPrompt\)/);
});

test("plan mode reuses technical-lighting grid, live measurements and render action layout", () => {
  assert.match(page, /studioMode==="plan"&&<section className="studio-source-section studio-plan-surfaces"/);
  assert.match(page, /room-plan-floor-reference/);
  assert.match(page, /room-plan-wall-reference/);
  assert.match(page, /planogram-technical-grid/);
  assert.match(page, /planogram-live-measurements/);
  assert.match(page, /planogram-relative-measurements/);
  assert.match(page, /distance=Math\.round\(Math\.hypot/);
  assert.match(page, /className="studio-canvas-render-button plan-render-button"/);
  assert.doesNotMatch(page, /<div className="plan-final-actions">/);
  assert.match(css, /planogram-minor-grid|planogram-technical-grid/);
  assert.match(css, /planogram-live-measurements/);
  assert.match(css, /planogram-relative-measurements/);
  assert.match(css, /plan-render-button/);
});

test("upscale status is independent from ordinary rendering", () => {
  assert.match(page, /const \[isUpscaling, setIsUpscaling\]/);
  assert.match(page, /setIsUpscaling\(true\);setIsGenerating\(true\)/);
  assert.match(page, /\{isUpscaling\?"Улучшаем…":"Апскейл"\}/);
});

test("point orbit and catalog reuse the approved visual patterns", () => {
  assert.match(css, /studio-point-menu[\s\S]*width: 252px/);
  assert.match(css, /mask: url\("data:image\/svg\+xml/);
  assert.match(css, /content: "Добавить"/);
  assert.match(css, /content: "Заменить"/);
  assert.match(css, /content: "Удалить"/);
  assert.match(page, /studio-bottom-catalog/);
  assert.match(page, /studio-catalog-bar/);
  assert.match(page, /aria-label="Категории мебели"/);
  assert.match(css, /inspector:has\(\.studio-bottom-catalog\)[\s\S]*height: 238px/);
  assert.match(css, /studio-bottom-catalog \.furniture-catalog-grid[\s\S]*overflow-x: auto/);
  assert.match(css, /room-canvas:has\(\.studio-point-menu\) \.material-brush-trigger svg[\s\S]*translate\(-50%,-50%\)/);
  assert.match(css, /@media \(min-width: 768px\)[\s\S]*inspector:has\(\.studio-bottom-catalog\)[\s\S]*inset: auto 0 0!important/);
  assert.match(css, /furniture-catalog-card > span img[\s\S]*transform: scale\(1\.35\)/);
  assert.match(css, /furniture-catalog-card > b[\s\S]*font-size: 7\.5px/);
  assert.match(css, /studio-point-actions button:hover:not\(\.deactivated\),[\s\S]*background: var\(--studio-burgundy\)/);
  assert.match(css, /:has\(\.studio-bottom-catalog:not\(\.catalog-fullscreen\)\) \.canvas-area[\s\S]*padding-bottom: clamp\(218px,26dvh,250px\)/);
  assert.match(page, /room-open-furniture-catalog/);
  assert.match(page, /Загрузить референс/);
  assert.match(page, /"Создать рендер"/);
  assert.match(page, /params\.get\("studioPreview"\) !== "legacy"/);
  assert.match(page, /persistentCatalogEnabled/);
  assert.match(css, /studio-catalog-generate/);
  assert.match(css, /data-studio-mode="image"\] \.studio-point-actions button\.active/);
  assert.match(css, /data-studio-orbit="right"/);
  assert.match(css, /data-studio-orbit="left"/);
  assert.match(css, /data-studio-orbit="below"/);
  assert.match(css, /room-canvas\.processing \.studio-point-menu/);
  assert.match(css, /studio-canvas-render-button/);
  assert.match(css, /studio-canvas-render-button:disabled/);
  assert.match(css, /studio-canvas-generation-error/);
  assert.match(css, /furniture-catalog-card\.selected/);
  assert.match(css, /button:hover:not\(\.deactivated\)/);
  assert.doesNotMatch(css, /button\.active:not\(:hover\):not\(:focus-visible\)/);
});

test("preview separates the full catalog from the current project material rail", () => {
  assert.match(page, /function FurnitureCatalogPage/);
  assert.match(page, /catalog","furniture"/);
  assert.match(page, /← Вернуться в проект/);
  assert.match(page, /NORR Møbler/);
  assert.match(page, /LEVE HOME/);
  assert.match(page, /minPrice/);
  assert.match(page, /widthMinMm/);
  assert.match(page, /Некоторые бренды временно недоступны/);
  assert.match(page, /studio-material-tray/);
  assert.match(page, /Материалы, выбранные для этого проекта/);
  assert.match(page, /Добавьте первый материал — каталог не запускает генерацию автоматически/);
  assert.match(page, /studioMaterials:override\.studioMaterials\?\?studioMaterials/);
  assert.match(page, /referenceImage,referenceName,referenceDetails,materialReference/);
  assert.match(css, /room-catalog-page/);
  assert.match(css, /studio-material-actions/);
  assert.match(css, /room-catalog-grid[\s\S]*repeat\(4,minmax\(0,1fr\)\)/);
});

test("custom furniture references collect real dimensions and pass them to generation", () => {
  assert.match(page, /studio-source-reference-specs/);
  assert.match(page, /РЕФЕРЕНС · НАСТРОЙКА/);
  assert.match(page, /orbitAction==="add"\|\|orbitAction==="replace"/);
  assert.match(page, /orbitAction==="material"/);
  assert.match(page, /РЕФЕРЕНС · МАТЕРИАЛ/);
  assert.match(page, /Размеры для этого режима не требуются/);
  assert.match(page, /setMaterialReference/);
  assert.doesNotMatch(page, /<h2>Направление<\/h2>/);
  assert.match(page, /Название референса/);
  assert.match(page, /Описание референса/);
  assert.match(page, /Ширина, мм/);
  assert.match(page, /Глубина, мм/);
  assert.match(page, /Высота, мм/);
  assert.match(page, /furnitureReference:furnitureReferenceDetails/);
  assert.match(page, /Укажите ширину, глубину и высоту пользовательского референса/);
  assert.match(css, /studio-source-reference-dimensions/);
  assert.doesNotMatch(page, /studio-furniture-reference-specs/);
  assert.match(generateRoute, /Hard physical dimensions: width/);
  assert.match(generateRoute, /mandatory real-world scale constraints/);
  assert.match(generateRoute, /Укажите ширину, глубину и высоту пользовательского референса/);
  assert.match(generateRoute, /levehome\\\.ru/);
  assert.match(generateRoute, /rom-divan\\\.ru/);
  assert.match(generateRoute, /!supportedCatalogHost\(imageUrl\.hostname\)/);
});

test("responsive studio provides tablet drawers and mobile bottom sheets", () => {
  assert.match(css, /@media \(max-width: 1279px\)/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.match(css, /\.drawer-context/);
  assert.match(css, /\.drawer-history/);
  assert.match(css, /border-radius: 18px 18px 0 0/);
  assert.match(css, /prefers-reduced-motion/);
});

test("layout loads preview CSS and the discovery map documents every required action", () => {
  assert.match(layout, /import "\.\/unified-studio-preview\.css"/);
  for (let index = 1; index <= 19; index += 1) {
    assert.match(discovery, new RegExp(`\\| I${String(index).padStart(2, "0")} \\|`));
  }
  for (let index = 1; index <= 18; index += 1) {
    assert.match(discovery, new RegExp(`\\| P${String(index).padStart(2, "0")} \\|`));
  }
  assert.match(discovery, /Undo.*No production control or handler found/i);
});
