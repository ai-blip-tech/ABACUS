import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/project-menu-preview.css", import.meta.url), "utf8");

test("project menu is part of the preview route without changing the legacy studio flow", () => {
  assert.match(page, /type AppView = "home" \| "account" \| "newProject" \| "projectMenu" \| "studio"/);
  assert.match(page, /navigate\(unifiedStudioPreview\?"projectMenu":"studio",project\.id\)/);
  assert.match(page, /navigate\(unifiedStudioPreview \? "projectMenu" : "studio", newProjectId\)/);
  assert.match(page, /#меню-проекта/);
});

test("all nine requested stages are preserved and measured plan is the third available stage", () => {
  for (const label of ["Обмерный план", "Монтаж, демонтаж", "Планировочное решение", "Концепция и материалы", "Интерьер и меблировка", "Технический свет", "Санузел", "Керамогранит", "Документация"]) {
    assert.match(page, new RegExp(label));
  }
  assert.equal((page.match(/available: true/g) || []).length, 3);
  assert.equal((page.match(/available: false/g) || []).length, 6);
});

test("active stages use existing destinations and placeholders explain their status", () => {
  assert.match(page, /if \(isInterior\) onOpenStudio\(\)/);
  assert.match(page, /if \(isLighting\) onOpenTechnical\(\)/);
  assert.match(page, /Раздел в работе/);
  assert.match(page, /скоро появится/);
  assert.match(page, /item\.id==="sources"\?window\.location\.assign/);
  assert.match(page, /\/measured-plan\?project=/);
  assert.match(page, /item\.available\?setSelectedStage\(item\.id\):setUnavailableStage\(item\.label\)/);
  assert.match(page, /project-menu-toast/);
  assert.doesNotMatch(page, /project-menu-placeholder/);
});

test("the secondary card advances to the next project stage instead of duplicating the active action", () => {
  assert.match(page, /const nextStage = PROJECT_MENU_STAGES\[stageIndex \+ 1\] \|\| null/);
  assert.match(page, /СЛЕДУЮЩИЙ РАЗДЕЛ/);
  assert.match(page, /<h3>\{nextStage\.label\}<\/h3>/);
  assert.match(page, /onClick=\{openNextStage\}>Перейти/);
  assert.doesNotMatch(page, /ПЕРЕЙТИ В РАЗДЕЛ/);
});

test("menu summaries are based on current project state rather than invented completion data", () => {
  assert.match(page, /historyCount=\{historyVersions\.length\}/);
  assert.match(page, /furnitureCount=\{planItems\.length \|\| proposalItems\.length\}/);
  assert.match(page, /coverImage=\{generatedImage \|\| interiorImage\}/);
  assert.match(page, /PROJECT_MENU_STAGES\.filter\(\(item\)=>item\.available\)\.length/);
  assert.match(page, /PROJECT_MENU_STAGES\.length\} разделов доступны/);
});

test("project menu stylesheet is loaded and has desktop and mobile layouts", () => {
  assert.match(layout, /import "\.\/project-menu-preview\.css"/);
  assert.match(css, /grid-template-columns: 300px minmax\(0, 1fr\)/);
  assert.match(css, /\.project-menu-header \{[\s\S]*position: sticky;[\s\S]*top: 0;/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /border-radius: 999px/);
});
