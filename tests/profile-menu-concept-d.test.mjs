import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dropdown = await readFile(new URL("../app/account-dropdown.tsx", import.meta.url), "utf8");
const dropdownCss = await readFile(new URL("../app/account-dropdown.css", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const account = await readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8");
const dashboardCss = await readFile(new URL("../app/account-dashboard-concept-d.css", import.meta.url), "utf8");
const hero = await readFile(new URL("../public/images/room-design/room-design-projects-dashboard-hero-reference.avif", import.meta.url));

test("profile menu keeps dynamic identity, approved order and existing permissions", () => {
  assert.match(dropdown, /const fullName = \[user\.firstName, user\.lastName\]/);
  assert.match(dropdown, /const initials = fullName/);
  for (const label of ["Личный кабинет", "Мои проекты", "Шаблоны", "История рендеров", "Платежи", "Настройки", "Безопасность", "Выйти"]) {
    assert.ok(dropdown.includes(label), `missing item: ${label}`);
  }
  for (const removed of ["Тариф и токены", "Купить токены", "История токенов"]) assert.doesNotMatch(dropdown, new RegExp(removed));
  assert.ok(dropdown.indexOf("Личный кабинет") < dropdown.indexOf("Мои проекты"));
  assert.ok(dropdown.indexOf("Мои проекты") < dropdown.indexOf("Шаблоны"));
  assert.match(dropdown, /href: "\/#кабинет"/);
  assert.match(dropdown, /href: "\/templates"/);
  assert.match(dropdown, /user\.features\?\.\[item\.feature\] !== false/);
  assert.match(dropdown, /user\.role === "admin"/);
  assert.doesNotMatch(dropdown, /tenant|userId|provider/i);
  assert.doesNotMatch(dropdown, /padStart\(2, "0"\)|<span>09<\/span>/);
  assert.match(dropdownCss, /width:min\(356px,calc\(100vw - 32px\)\)/);
  assert.match(dropdownCss, /height:48px;min-height:48px/);
  assert.match(dropdownCss, /width:min\(360px,calc\(100vw - 24px\)\)/);
});

test("profile menu follows accessible popover behavior without an incomplete ARIA menu model", () => {
  assert.match(dropdown, /aria-expanded=\{open\}/);
  assert.match(dropdown, /aria-controls="account-profile-menu"/);
  assert.match(dropdown, /event\.detail === 0/);
  assert.match(dropdown, /firstLinkRef\.current\?\.focus\(\)/);
  assert.match(dropdown, /event\.key === "Escape"/);
  assert.match(dropdown, /triggerRef\.current\?\.focus\(\)/);
  assert.match(dropdown, /pointerdown/);
  assert.doesNotMatch(dropdown, /role="menu(?:item)?"/);
  assert.match(dropdownCss, /@media\(max-width:767px\)/);
  assert.match(dropdownCss, /@media\(prefers-reduced-motion:reduce\)/);
});

test("dashboard and account use the exact approved local hero with HTML slogans", () => {
  const path = "/images/room-design/room-design-projects-dashboard-hero-reference.avif";
  assert.ok(dashboard.includes(path));
  assert.ok(account.includes(path));
  assert.match(dashboard, /Good<br\/>Rooms<br\/>Better<br\/>Lives/);
  assert.match(dashboard, /ПРОСТРАНСТВО<br\/>ДЛЯ ЛУЧШИХ<br\/>ИСТОРИЙ/);
  assert.match(dashboardCss, /object-fit:cover/);
  assert.match(dashboardCss, /object-position:45% 50%/);
  assert.equal(createHash("sha256").update(hero).digest("hex"), "a6587e5d7204aa0734efe266552d6ced784b94719ba15ffcb9cafa13a996a15e");
});
