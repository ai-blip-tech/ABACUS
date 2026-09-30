import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/account/page.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/account/account.css", import.meta.url), "utf8");
const conceptTokens = await readFile(new URL("../app/concept-d.css", import.meta.url), "utf8");

test("Concept D account shell exposes all eight sections through one accessible navigation", () => {
  for (const id of ["profile", "plan", "purchase", "tokens", "renders", "payments", "settings", "security"]) {
    assert.match(page, new RegExp(`id: "${id}"`));
  }
  assert.match(page, /aria-current=\{active === item\.id \? "page"/);
  assert.match(page, /event\.key === "Escape"/);
  assert.match(page, /БОЛЬШЕ, ЧЕМ ИНТЕРЬЕР/);
  assert.match(page, /Good<br\/>Rooms<br\/>Better<br\/>Lives/);
});

test("account UI keeps user-facing terminology and does not expose mock checkout", () => {
  assert.doesNotMatch(page, />Tenant memberships</);
  assert.doesNotMatch(page, /Создать mock-платёж/);
  assert.doesNotMatch(page, /method: "POST"[^\n]+\/api\/account\/payments/);
  assert.match(page, /Организация/);
  assert.match(page, /В текущем режиме токены не списываются/);
  assert.match(page, /provider !== "mock"/);
});

test("Concept D account styles cover desktop, tablet, mobile and reduced motion", () => {
  assert.match(css, /--account-accent:var\(--rd-oxblood\)/);
  assert.match(conceptTokens, /--rd-oxblood: #7b1020/);
  assert.match(css, /@media\(max-width:1199px\)/);
  assert.match(css, /@media\(max-width:767px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /min-height:44px/);
});
