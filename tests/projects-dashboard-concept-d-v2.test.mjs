import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/account-dashboard-concept-d.css", import.meta.url), "utf8");
const overviewRoute = await readFile(new URL("../app/api/account/overview/route.ts", import.meta.url), "utf8");
const start = source.indexOf("function AccountDashboardWithProfile");
const end = source.indexOf("function ProfileModal", start);
const dashboard = source.slice(start, end);

test("projects dashboard v2 owns the complete Concept D composition", () => {
  for (const className of ["projects-dashboard-top", "projects-dashboard-header", "projects-dashboard-media", "projects-dashboard-ledger", "projects-dashboard-projects", "projects-dashboard-generations", "projects-dashboard-footer"]) {
    assert.ok(dashboard.includes(className), `missing ${className}`);
  }
  assert.match(dashboard, />ROOM DESIGN</);
  assert.doesNotMatch(dashboard, /ROOM<span>design/);
  assert.match(dashboard, /Продолжайте работу с сохранёнными результатами/);
  assert.match(dashboard, /или создайте новый проект/);
});

test("dashboard keeps live API data and honest states instead of target fixtures", () => {
  assert.match(dashboard, /projects\.map\(\(project\)/);
  assert.match(dashboard, /generations\.map\(\(generation\)/);
  assert.match(dashboard, /Number\(summary\.generation_count\|\|0\)/);
  assert.match(dashboard, /Number\(summary\.total_tokens\|\|0\)/);
  assert.match(dashboard, /Здесь появятся ваши проекты/);
  assert.match(dashboard, /Сохранённых генераций пока нет/);
  assert.doesNotMatch(dashboard, />17 200</);
  assert.doesNotMatch(dashboard, /Квартира на Патриарших|Дом в Комарово|Кабинет архитектора/);
});

test("dashboard CSS implements split hero, ledger, editorial states and responsive layouts", () => {
  assert.match(css, /grid-template-columns:46% 54%/);
  assert.match(css, /height:320px/);
  assert.match(css, /object-fit:cover/);
  assert.match(css, /projects-dashboard-ledger/);
  assert.match(css, /border-radius:3px/);
  assert.doesNotMatch(css, /#[bB]96420/);
  assert.match(css, /@media\(max-width:1199px\)/);
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /@media\(max-width:390px\)/);
});

test("dashboard dropdown is compact and explicitly scoped to this page", () => {
  assert.match(dashboard, /<AccountDropdown user=\{user\} dashboard\/>/);
  assert.match(css, /dashboard-account-dropdown \.account-dropdown-card/);
  assert.match(css, /width:min\(320px/);
  assert.match(css, /max-height:min\(430px/);
});

test("the complete project card opens the project with keyboard support", () => {
  assert.match(dashboard, /className="projects-dashboard-project" role="link" tabIndex=\{0\}/);
  assert.match(dashboard, /onClick=\{\(\)=>onOpenProject\(project\)\}/);
  assert.match(dashboard, /event\.key==="Enter"\|\|event\.key===" "/);
  assert.doesNotMatch(dashboard, /<button type="button" onClick=\{\(\)=>onOpenProject\(project\)\}>Открыть/);
  assert.match(css, /\.projects-dashboard-project\{[^}]*cursor:pointer/);
  assert.match(css, /\.projects-dashboard-project:focus-visible/);
});

test("project cards render the latest persisted project image", () => {
  assert.match(overviewRoute, /SELECT id, name, project_type, description, state_json/);
  assert.match(overviewRoute, /state\.generatedAsset \|\| latestHistoryAsset \|\| state\.interiorAsset/);
  assert.match(overviewRoute, /\?v=\$\{encodeURIComponent\(updatedAt\)\}/);
  assert.match(overviewRoute, /preview_image: projectPreviewUrl\(String\(project\.id\), state_json, project\.updated_at\)/);
  assert.match(dashboard, /project\.preview_image\?<img src=\{project\.preview_image\}/);
  assert.match(css, /\.projects-dashboard-project-mark img\{[^}]*object-fit:cover/);
});
