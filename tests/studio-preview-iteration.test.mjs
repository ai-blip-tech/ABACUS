import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const [page, layout, styles, accountStyles, homeOverride] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/studio-preview-iteration.css", import.meta.url), "utf8"),
  readFile(new URL("../app/account-dashboard-concept-d.css", import.meta.url), "utf8"),
  readFile(new URL("../app/home-override.css", import.meta.url), "utf8"),
]);

test("Studio keeps the source image uncropped and overlays render history", () => {
  assert.match(layout, /studio-preview-iteration\.css/);
  assert.match(styles, /\.room-canvas>img\{object-fit:contain!important/);
  assert.match(styles, /\.canvas-area>\.history-strip\{position:relative;z-index:8/);
  assert.match(styles, /margin:-128px auto 16px/);
  assert.match(styles, /overflow-x:auto/);
  assert.match(styles, /@media\(hover:none\),\(pointer:coarse\)/);
  assert.match(page, /openHistoryVersion\(version\)/);
  assert.match(page, /downloadHistoryVersion\(version\)/);
});

test("dashboard account trigger remains the existing accessible dropdown", () => {
  assert.match(page, /<AccountDropdown user=\{user\} dashboard\/>/);
  assert.match(styles, /dashboard-account-trigger[^}]*backdrop-filter:blur\(13px\)/);
  assert.match(accountStyles, /dashboard-account-dropdown \.account-dropdown-card/);
});

test("planogram clipboard ignores editable fields and creates independent clones", () => {
  assert.match(page, /isEditablePlanogramShortcutTarget\(event\.target\)/);
  assert.match(page, /key==="c"/);
  assert.match(page, /key!=="v"/);
  assert.match(page, /clonePlanogramItem\(planClipboardRef\.current,crypto\.randomUUID\(\),pasteIndexRef\.current\)/);
});

test("Editor controls follow hover or a real placement point instead of sticky mouse focus", () => {
  assert.doesNotMatch(homeOverride, /room-canvas:focus-within/);
  assert.doesNotMatch(homeOverride, /furniture-action-bar:focus-within/);
  assert.match(homeOverride, /canvas-area:has\(\.material-tool\) \.furniture-action-bar/);
  assert.match(homeOverride, /room-canvas :focus-visible/);
});
