import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const createProjectCss = await readFile(new URL("../app/create-project.css", import.meta.url), "utf8");
const dashboardCss = await readFile(new URL("../app/account-dashboard-concept-d.css", import.meta.url), "utf8");
const dropdownCss = await readFile(new URL("../app/account-dropdown.css", import.meta.url), "utf8");
const conceptCss = await readFile(new URL("../app/concept-d.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("keeps a vh fallback before dynamic viewport units", () => {
  assert.match(createProjectCss, /min-height:\s*100vh;\s*min-height:\s*100dvh;/);
  assert.match(createProjectCss, /min-height:\s*calc\(100vh - 76px\);\s*min-height:\s*calc\(100dvh - 76px\);/);
  assert.match(dashboardCss, /min-height:100vh;\s*min-height:100dvh;/);
  assert.match(dropdownCss, /max-height:calc\(100vh - 80px\);max-height:calc\(100dvh - 80px\)/);
});

test("serves Concept D fonts locally through next/font", () => {
  assert.doesNotMatch(conceptCss, /fonts\.(googleapis|gstatic)\.com/);
  assert.match(conceptCss, /var\(--font-cormorant-garamond\)/);
  assert.match(conceptCss, /var\(--font-manrope\)/);
  assert.match(layout, /from "next\/font\/local"/);
  assert.match(layout, /\.\/fonts\/cormorant-garamond-400\.woff2/);
  assert.match(layout, /\.\/fonts\/manrope-600\.woff2/);
});

test("root hydration preserves Concept D deep links instead of rewriting them to the landing page", () => {
  assert.match(page, /decodeURIComponent\(window\.location\.hash\)/);
  assert.match(page, /window\.location\.href/);
  assert.doesNotMatch(page, /replaceState\(\{ norrView: "home" \}, "", "\/"\)/);
});
