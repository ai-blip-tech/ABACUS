import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/create-project.css", import.meta.url), "utf8");

test("unified preview replaces the generic project form with the eight-part brief", () => {
  for (const label of ["ЗАКАЗЧИК И КОНТАКТНОЕ ЛИЦО","ОБЪЕКТ И АДРЕС","ЦЕЛЬ ПРОЕКТА","СТИЛЬ И НАСТРОЕНИЕ","КЛЮЧЕВЫЕ ТРЕБОВАНИЯ","БЮДЖЕТ И ВИЛКА","СРОКИ И ЭТАПЫ","ОСОБЫЕ УСЛОВИЯ"]) assert.match(page,new RegExp(label));
  assert.match(page,/unifiedStudioPreview\?<>/);
  assert.match(page,/project-brief-heading/);
  assert.match(page,/briefDescription/);
  assert.match(page,/briefName/);
});

test("preview hero contains only the image and removes decorative footer copy", () => {
  assert.match(page,/project-brief-blueprint\.png/);
  assert.match(page,/projectBrief\.client\.trim\(\).*project-brief-signature/s);
  assert.match(css,/\.project-brief-signature/);
  assert.match(page,/!unifiedStudioPreview&&<><div className="project-intro-shade"/);
  assert.match(page,/!unifiedStudioPreview&&<footer className="project-panel-footer"/);
});

test("brief preview uses rounded controls and the established account pill", () => {
  assert.match(page,/AccountDropdown user=\{user\} dashboard=\{unifiedStudioPreview\}/);
  assert.match(css,/\.project-page-concept\.is-brief-preview \.create-project[^}]*border-radius: 999px/);
  assert.match(css,/\.project-page-concept\.is-brief-preview \.dashboard-account-trigger[^}]*border-radius: 999px/);
});
