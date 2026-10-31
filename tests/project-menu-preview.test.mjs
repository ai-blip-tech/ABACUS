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

test("all nine stages are preserved and planning plus materials are available", () => {
  for (const label of ["Обмерный план", "Монтаж, демонтаж", "Планировочное решение", "Концепция и материалы", "Интерьер и меблировка", "Технический свет", "Санузел", "Керамогранит", "Документация"]) {
    assert.match(page, new RegExp(label));
  }
  assert.equal((page.match(/available: true/g) || []).length, 6);
  assert.equal((page.match(/available: false/g) || []).length, 3);
  assert.match(page, /isPlanning\?<PlanningStagePreview/);
  assert.match(page, /\/planning-plan\?project=/);
  assert.match(page, /if \(isMaterials\) window.location.assign\(`\/materials-concept\?project=/);
});

test("active stages use existing destinations and placeholders explain their status", () => {
  assert.match(page, /if \(isInterior\) onOpenStudio\(\)/);
  assert.match(page, /if \(isLighting\) onOpenTechnical\(\)/);
  assert.match(page, /Раздел в работе/);
  assert.match(page, /скоро появится/);
  assert.doesNotMatch(page, /item\.id==="sources"\?window\.location\.assign/);
  assert.match(page, /if \(isMeasured\) window.location.assign/);
  assert.match(page, /isMeasured\?<MeasuredStagePreview/);
  assert.match(page, /\/measured-plan\?project=/);
  assert.match(page, /item\.available\?setSelectedStage\(item\.id\):setUnavailableStage\(item\.label\)/);
  assert.match(page, /project-menu-toast/);
  assert.doesNotMatch(page, /project-menu-placeholder/);
});
test('measured stage preview compares source and saved geometry without writing project data',async()=>{
 const preview=await readFile(new URL('../app/measured-plan/stage-preview.tsx',import.meta.url),'utf8');
 assert.match(preview,/Исходный файл/);assert.match(preview,/Обмерный план · результат/);assert.match(preview,/MeasuredPlanThumbnail doc=\{doc\}/);assert.match(preview,/Продолжить работу/);assert.match(preview,/onClick=\{onContinue\}/);assert.match(preview,/onClick=\{onNext\}/);
 assert.match(preview,/cache:'no-store'/);assert.doesNotMatch(preview,/method:\s*['"](?:PUT|POST|DELETE)['"]/);
 assert.match(preview,/role="alert"/);assert.match(preview,/План ещё не загружен/);
 const editor=await readFile(new URL('../app/measured-plan/page.tsx',import.meta.url),'utf8');assert.match(editor,/&stage=sources#меню-проекта/);
});

test('partition stage opens a read-only preview before its editor, matching the measured stage flow', async () => {
  const preview = await readFile(new URL('../app/partition-plan/stage-preview.tsx', import.meta.url), 'utf8');
  assert.match(page, /isInstallation\?<PartitionStagePreview/);
  assert.match(page, /if \(isInstallation\) window.location.assign\(`\/partition-plan\?project=/);
  assert.match(page, /onClick=\{\(\)=>item.available\?setSelectedStage\(item.id\)/);
  assert.match(preview, /Существующая основа/);
  assert.match(preview, /После демонтажа и монтажа/);
  assert.match(preview, /onClick=\{onContinue\}/);
  assert.match(preview, /Продолжить работу/);
  assert.match(preview, /onClick=\{onNext\}/);
  assert.doesNotMatch(preview, /method:\s*['"](?:PUT|POST|DELETE)['"]/);
});

test('source and result provide reversible fullscreen quick view without editing data',async()=>{
 const preview=await readFile(new URL('../app/measured-plan/stage-preview.tsx',import.meta.url),'utf8');
 assert.match(preview,/aria-label="Увеличить исходный файл"/);assert.match(preview,/aria-label="Увеличить обмерный план"/);
 assert.match(preview,/dialog.showModal\(\)/);assert.match(preview,/dialog.close\(\)/);
 assert.match(preview,/onCancel=\{e=>\{e.preventDefault\(\);setExpanded\(null\);\}\}/);
 assert.match(preview,/onClick=\{\(\)=>setExpanded\(null\)\}/);
 assert.match(preview,/document.body.style.overflow=previousOverflow/);
 assert.match(css,/\.measured-stage-viewer\{[^}]*height:100dvh/);
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
