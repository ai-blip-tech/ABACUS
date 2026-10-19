import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/unified-studio-preview.css", import.meta.url), "utf8");
const discovery = await readFile(new URL("../docs/unified-studio-preview-discovery.md", import.meta.url), "utf8");

test("unified studio is guarded by an explicit preview query flag", () => {
  assert.match(page, /params\.get\("studioPreview"\) === "unified"/);
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

test("image editor uses a contextual point menu and preserves advanced tools", () => {
  assert.match(page, /studio-point-menu/);
  assert.match(page, /Действия в выбранной точке/);
  assert.match(page, /removeAtPlacement\(placementPoint\)/);
  assert.match(page, /Каталог, референс и текстовая правка/);
  assert.match(page, /ЧТО ИЗМЕНИТЬ\?/);
  assert.match(page, /upscaleHistoryVersion/);
  assert.match(page, /material-brush-trigger/);
  assert.match(css, /data-studio-mode="image"\] \.inspector-title \{ display: none/);
});

test("point orbit and catalog reuse the approved visual patterns", () => {
  assert.match(css, /studio-point-menu[\s\S]*width: 340px/);
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
