import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const sitewide = await readFile(new URL("../app/sitewide-it.tsx", import.meta.url), "utf8");
const api = await readFile(new URL("../app/api/it/route.ts", import.meta.url), "utf8");

test("Ono is mounted once at the app layout and excluded only from the public landing", () => {
  assert.match(layout, /<SitewideIt\/>/);
  assert.doesNotMatch(home, /<ItOrb\b/);
  assert.match(sitewide, /context\.page === "landing"/);
  assert.match(sitewide, /roomdesign:it-context/);
  assert.match(home, /roomdesign:it-context/);
});

test("template catalog and template workspaces receive contextual assistant prompts", () => {
  assert.match(sitewide, /pathname === "\/templates"/);
  assert.match(sitewide, /pathname\.startsWith\("\/templates\/"\)/);
  assert.match(sitewide, /Как работает шаблон/);
  assert.match(sitewide, /Какой шаблон поможет с моей задачей/);
  assert.match(sitewide, /template\.inputSlots\.map/);
  assert.match(api, /CURRENT_ROOM_DESIGN_CONTEXT\.template/);
  assert.match(api, /статус — «Скоро»/);
});

test("Ono remains available on account, admin and proposal routes", () => {
  assert.match(sitewide, /pathname === "\/account"/);
  assert.match(sitewide, /pathname === "\/admin"/);
  assert.match(sitewide, /pathname\.startsWith\("\/proposal\/"\)/);
});
