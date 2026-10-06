import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { proposalImageFormat } from "../lib/proposal-image.ts";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const globalCss = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const dashboardCss = await readFile(new URL("../app/account-dashboard-concept-d.css", import.meta.url), "utf8");
const proposalRoute = await readFile(new URL("../app/api/proposal/route.ts", import.meta.url), "utf8");
const generateRoute = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
const projectRoute = await readFile(new URL("../app/api/projects/[id]/route.ts", import.meta.url), "utf8");
const itOrb = await readFile(new URL("../app/it-orb.tsx", import.meta.url), "utf8");
const itOrbCss = await readFile(new URL("../app/it-orb.css", import.meta.url), "utf8");

test("proposal images are detected by their bytes before an unreliable MIME header", () => {
  assert.equal(proposalImageFormat(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]), "image/png"), "jpeg");
  assert.equal(proposalImageFormat(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/jpeg"), "png");
  assert.equal(proposalImageFormat(Uint8Array.from([0x00, 0x01]), "image/jpeg; charset=binary"), null);
  assert.equal(proposalImageFormat(Uint8Array.from([0x00, 0x01]), "image/webp"), null);
  assert.match(proposalRoute, /normalizeProposalImage/);
});

test("commercial proposal opens an editor and downloads PDF only after confirmation", () => {
  assert.match(page, /await persistProject\(targetId, name\);[\s\S]*?\/proposal\/\$\{encodeURIComponent\(targetId\)\}/);
  assert.match(page, /Создать коммерческое предложение/);
  assert.match(proposalRoute, /"Content-Type": "application\/pdf"/);
  assert.match(proposalRoute, /"Content-Disposition": `attachment;/);
});

test("each render history version restores its own commercial proposal product snapshot", () => {
  assert.match(page, /type HistoryItem = \{[^}]*proposalItems\?: PlanItem\[\]/);
  assert.match(page, /setProposalItems\(version\.proposalItems \|\| \[\]\)/);
  assert.match(page, /addHistoryVersion\(newInterior,[\s\S]*?nextProposalItems\)/);
  assert.match(projectRoute, /proposalItems: sanitizeItems\(item\.proposalItems, `history-\$\{index\}-proposal-item`\)/);
  assert.match(projectRoute, /historyVersions:[\s\S]*?proposalItems: \(version\.proposalItems \|\| \[\]\)/);
});

test("remove flow sends a point-guided remove operation and restores editor controls", () => {
  assert.match(generateRoute, /body\.removal \? "remove"/);
  assert.match(generateRoute, /body\.roomImage && body\.pointEdit\?\.markedImage && body\.removal/);
  assert.match(page, /const removeSelectedObject[\s\S]*?createPointMarkerImage\(roomImage,point\)[\s\S]*?operation:"remove"[\s\S]*?pointEdit[\s\S]*?removal:\{ name:item\.name \}/);
  assert.doesNotMatch(page.match(/const removeSelectedObject[\s\S]*?const openHistoryVersion/)?.[0] || "", /prepareLocalEdit|local\.compose|\/api\/segment|mask:/);
  assert.match(page, /const removeSelectedObject[\s\S]*?setActiveTool\("Добавить мебель"\); setFurnitureAction\("add"\)/);
  assert.match(page, /const removeAtPlacement[\s\S]*?roomImage,pointEdit,removal:/);
});

test("mouse dragging disables native drag without replacing touch, context menu or double-click handlers", () => {
  assert.match(page, /draggable=\{false\} className=\{`planogram-furniture/);
  assert.match(page, /onDragStart=\{\(event\)=>event\.preventDefault\(\)\}/);
  assert.match(page, /if\(event\.pointerType==="mouse"\)\{if\(event\.button!==0\)return;event\.preventDefault\(\);\}/);
  assert.match(page, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(page, /onDoubleClick=\{\(event\)=>/);
  assert.match(page, /onContextMenu=\{\(event\)=>/);
  assert.match(globalCss, /\.planogram-furniture\{user-select:none;-webkit-user-select:none;-webkit-user-drag:none\}/);
});

test("camera FOV uses the same rotation as the render brief and raster reference", () => {
  assert.match(page, /className="plan-camera-fov"/);
  assert.match(page, /rotate\(\$\{camera\.rotation\}deg\)/);
  assert.match(page, /angle=current\.rotation\*Math\.PI\/180/);
  assert.match(page, /азимут \$\{Math\.round\(current\.rotation\)\}°/);
  assert.match(globalCss, /\.plan-camera-marker \.plan-camera-fov\{[^}]*clip-path:polygon\(0 50%,100% 0,100% 100%\)/);
});

test("an unowned generation can be named once, created, persisted and saved again without duplication", () => {
  assert.match(page, /setProjectId\(""\);setProjectName\(""\)/);
  assert.match(page, /if \(!projectId\) \{ setSaveProjectName/);
  assert.match(page, /fetch\("\/api\/projects",\{method:"POST"/);
  assert.match(page, /setProjectId\(targetId\)/);
  assert.match(page, /await persistProject\(targetId,name\)/);
  assert.match(page, /role="dialog"[^>]*aria-labelledby="save-project-title"/);
});

test("latest generations expose a restrained hover only for precise hover pointers", () => {
  assert.match(dashboardCss, /@media\(hover:hover\) and \(pointer:fine\)/);
  assert.match(dashboardCss, /\.projects-dashboard-generation:hover/);
  assert.match(dashboardCss, /transform:scale\(1\.025\)/);
});

test("the empty It chat starts with quick questions instead of an editor intro block", () => {
  assert.doesNotMatch(itOrb, /Я вижу, где вы|РЕДАКТОР ИЗОБРАЖЕНИЙ|СОЗДАНИЕ ИНТЕРЬЕРА/);
  assert.match(itOrb, /messages\.length > 0 && <div className="it-transcript"/);
  assert.match(itOrb, /messages\.length === 0 && \(/);
  assert.match(itOrbCss, /\.it-surface\.is-empty\{height:auto\}/);
  assert.match(itOrbCss, /\.it-surface\.is-empty \.it-composer\{margin-top:0\}/);
});
