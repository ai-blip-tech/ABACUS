import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homeSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const accountSource = await readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8");
const dropdownSource = await readFile(new URL("../app/account-dropdown.tsx", import.meta.url), "utf8");
const dropdownCss = await readFile(new URL("../app/account-dropdown.css", import.meta.url), "utf8");
const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("Studio exposes only the requested user-facing terminology", () => {
  for (const label of ["Редактор изображений", "Создание интерьера", "История рендеров", "Создать интерьер", "Создать рендер"]) {
    assert.ok(homeSource.includes(label), `missing label: ${label}`);
  }
  assert.doesNotMatch(homeSource, />Сгенерировать интерьер</);
  assert.doesNotMatch(homeSource, />Создать визуализацию</);
  assert.doesNotMatch(homeSource, />История генераций</);
  assert.match(accountSource, /История рендеров/);
  assert.doesNotMatch(accountSource, /История генераций/);
});

test("one account dropdown is used by project and Studio headers", () => {
  assert.match(homeSource, /<AccountDropdown user=\{user\}\/>/);
  assert.match(homeSource, /<AccountDropdown user=\{user\} studio\/>/);
  assert.doesNotMatch(homeSource, /className="avatar"[^>]+window\.location\.assign\("\/account"\)/);
  for (const label of ["Личный кабинет", "Тариф и токены", "Купить токены", "История токенов", "История рендеров", "Платежи", "Настройки", "Безопасность", "Выйти"]) {
    assert.ok(dropdownSource.includes(label), `missing dropdown item: ${label}`);
  }
  assert.match(dropdownSource, /pointerdown/);
  assert.match(dropdownSource, /event\.key === "Escape"/);
  assert.match(dropdownSource, /setOpen\(\(value\) => !value\)/);
  assert.match(dropdownCss, /z-index:150/);
  assert.match(dropdownCss, /width:268px/);
});

test("both existing save actions share one visual control without changing handlers", () => {
  assert.match(homeSource, /className=\{projectSaved \? "project-save-control project-save-head saved"/);
  assert.match(homeSource, /className="project-save-control plan-save" onClick=\{exportPlan\}/);
  assert.match(homeSource, /onClick=\{\(\)=>void saveProject\(\)\}/);
  assert.match(globalCss, /\.canvas-actions \.project-save-control,\.planogram-toolbar-actions \.project-save-control/);
});

test("planogram templates use a unique key for table variants", () => {
  assert.match(homeSource, /key=\{`\$\{item\.kind\}:\$\{item\.name\}`\}/);
  assert.doesNotMatch(homeSource, /key=\{item\.kind\}/);
});
