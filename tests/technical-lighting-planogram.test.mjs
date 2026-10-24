import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/technical-lighting/page.tsx", import.meta.url), "utf8");
const generationRoute = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
const catalogRoute = await readFile(new URL("../app/api/lighting/catalog/route.ts", import.meta.url), "utf8");
const homeSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const imageActionsSource = await readFile(new URL("../app/editor-image-actions.tsx", import.meta.url), "utf8");
const projectLightingRoute = await readFile(new URL("../app/api/projects/[id]/technical-lighting/route.ts", import.meta.url), "utf8");

test("planogram adds catalog tracks at their real catalog length", () => {
  assert.match(source, /product\.specs\.lengthMm\|\|2000/);
  assert.match(source, /pointsFor\(lengthMm,room/);
  assert.match(source, /onClick=\{\(\)=>addProduct\(product\)\}/);
});

test("planogram uses draggable catalog objects instead of freehand plan drawing", () => {
  assert.match(source, /onPointerMove=\{move\}/);
  assert.match(source, /setDrag\(\{kind:"track"/);
  assert.doesNotMatch(source, /folio-plan[^>]+onPointerDown=\{[^}]*photoPoint/);
});

test("planogram supports precise rotation, copy-paste and live wall offsets", () => {
  assert.match(source, /setTrackRotation/);
  assert.match(source, /Угол поворота трека/);
  assert.match(source, /onDoubleClick=/);
  assert.match(source, /setRotationEditingId\(track\.id\)/);
  assert.match(source, /target\.closest\("\.folio-track-hit,\.folio-track-rotate-handle,\.folio-fixture,\.folio-ceiling-vertex"\)/);
  assert.match(source, /folio-track-rotate-handle/);
  assert.match(source, /setRotatingTrack/);
  assert.match(source, /event\.key\.toLowerCase\(\)/);
  assert.match(source, /planClipboard/);
  assert.match(source, /shiftedTrackPoints/);
  assert.match(source, /dragMeasurement/);
  assert.match(source, /folio-measurements/);
  assert.match(source, /10000\/room\.width/);
  assert.match(source, /50000\/room\.width/);
});

test("track luminaires have a dedicated reference-first catalog category", () => {
  assert.match(source, /track_fixture:"Трековые светильники"/);
  assert.match(source, /\["track","track_fixture","fixture","power","accessory","all"\]/);
  assert.match(source, /catalogType==="track_fixture"/);
  assert.match(source, /product\.type==="track_fixture"/);
  assert.match(source, /Сначала добавьте трек/);
});

test("fixtures can snap to a nearby track or remain independent", () => {
  assert.match(source, /nearest\(x\.point,tracks,room\)/);
  assert.match(source, /trackId:hit\.trackId/);
  assert.match(source, /trackId:undefined/);
});

test("selected product details live in the right sidebar, not over the plan", () => {
  const sidebarStart = source.indexOf('<aside className="folio-right">');
  const selectedCard = source.indexOf('<section className="folio-selection-card">');
  assert.ok(sidebarStart >= 0);
  assert.ok(selectedCard > sidebarStart);
});

test("lighting controls and post-generation editing are available", () => {
  assert.match(source, /setCctK\(Number\(e\.target\.value\)\)/);
  assert.match(source, /setTimeOfDay\("night"\)/);
  assert.match(source, /mode==="image"&&photo&&<section className="folio-correction"/);
  assert.match(source, /setMode\("image"\)/);
  assert.match(source, /chooseEditAction\("replace"\)/);
  assert.match(source, /chooseEditAction\("remove"\)/);
  assert.match(source, /operation:"global_edit"/);
  assert.match(source, /prompt:instruction,roomImage:photo/);
  assert.match(source, /operation:"plan_render",prompt:DEFAULT_PLAN_PROMPT/);
});

test("generated images open in a neutral full-screen viewer and support download and upscale", () => {
  assert.match(source, /useState<EditAction>\(null\)/);
  assert.match(source, /setEditAction\(null\)/);
  assert.match(source, /<EditorImageActions image=\{photo\} name=\{photoName\|\|"Технический свет"\} onError=\{setError\}/);
  assert.match(imageActionsSource, /Открыть изображение на весь экран/);
  assert.match(imageActionsSource, /Полноэкранный просмотр изображения/);
  assert.match(imageActionsSource, /dialog\.current\?\.showModal\(\)/);
  assert.match(imageActionsSource, /await downloadImageAsJpeg\(image, name\)/);
  assert.match(imageActionsSource, /onCancel=\{\(\) => setOpen\(false\)\}/);
  assert.match(source, /downloadPhoto/);
  assert.match(source, /upscalePhoto/);
  assert.match(source, /operation:"upscale"/);
  const imageActions = source.slice(source.indexOf('<section className="folio-image-actions">'), source.indexOf('</section>}{history.length'));
  assert.doesNotMatch(imageActions, /Готовое изображение|Открыть на весь экран|Скачать изображение/);
  assert.match(imageActions, /Сделать апскейл/);
  assert.match(source, /<span className="folio-number">04<\/span>\n<i\/>\n<h2>История рендеров<\/h2>/);
});

test("catalog references are added first and require physical dimensions", () => {
  assert.match(source, /folio-reference-upload/);
  assert.match(source, /Добавить из референса/);
  assert.match(source, /uploadReferenceProduct/);
  assert.match(source, /updateReferenceDimension/);
  assert.match(source, /Ширина, мм/);
  assert.match(source, /Длина, мм/);
  assert.match(source, /incompleteReference/);
  assert.match(source, /source:x\.isReference\?"reference":"catalog"/);
});

test("brand selector defaults to all brands and gets available brands from the catalog API", () => {
  assert.match(source, /useState\("all"\)/);
  assert.match(source, /Выбор бренда/);
  assert.match(source, /Все бренды/);
  assert.match(source, /brands\.map/);
  assert.match(source, /new URLSearchParams\(\{type:catalogType,brand/);
  assert.match(catalogRoute, /brands: BRANDS/);
  assert.match(catalogRoute, /brand !== "all"/);
});

test("generation prompts stay independent of the current catalog brand", () => {
  assert.doesNotMatch(generationRoute, /selected GoMoon products/i);
  assert.match(generationRoute, /selected catalog products/i);
});

test("products used in the current render move first and receive a visible catalog marker", () => {
  assert.match(source, /imageProducts,setImageProducts/);
  assert.match(source, /completeRecoveredGeneration\([^;]+nextImageProducts/);
  assert.match(source, /setImageProducts\(item\.products\)/);
  assert.match(source, /visibleCatalogProducts/);
  assert.match(source, /imageProductIds\.has\(b\.id\)/);
  assert.match(source, /used \"/);
  assert.match(source, /✓ В изображении/);
});

test("image changes are applied from the left panel and primary controls use rounded styling", () => {
  assert.doesNotMatch(source, /Линиями размечаются треки, точками/);
  assert.match(source, /className="folio-apply"/);
  assert.match(source, /mode==="plan"&&<div className="folio-generate-wrap">/);
});

test("technical-lighting uses the shared project header and a section-only toolbar label", () => {
  assert.doesNotMatch(source, /Проект \/ Технический свет/);
  assert.match(source, /<EditorHeader user=\{user\} projectName=\{projectName\}/);
  assert.match(source, /<header className="folio-header folio-editor-toolbar">\s*<span className="folio-crumb">Технический свет<\/span>/);
});

test("ceiling plan supports exact arbitrary polygon geometry", () => {
  assert.match(source, /type CeilingPreset="rectangle"\|"l-shape"\|"bay"\|"custom"/);
  assert.match(source, /Г-образный/);
  assert.match(source, /Нарисовать контур/);
  assert.match(source, /Замкнуть контур/);
  assert.match(source, /ceilingVertexDrag/);
  assert.match(source, /updateCeilingSegmentLength/);
  assert.match(source, /ТОЧНЫЕ РАЗМЕРЫ СТОРОН/);
  assert.match(source, /updateRoomDimensions/);
  assert.match(source, /pointsFor\(track\.lengthMm,sized/);
  assert.match(source, /folio-room-measure width/);
  assert.match(source, /folio-room-measure length/);
  assert.match(source, /axisBounds\(\{x,y\},ceilingPoints\)/);
  assert.match(source, /pointInPolygon\(p,ceilingPoints\)/);
});

test("moving a fixture or track shows live distances to nearby lighting elements", () => {
  assert.match(source, /relativeMeasurements=useMemo/);
  assert.match(source, /if\(drag\.kind==="track"\)/);
  assert.match(source, /fixture\.trackId!==moving\.id/);
  assert.match(source, /label:"до трека"/);
  assert.match(source, /`до светильника \$\{index\+1\}`/);
  assert.match(source, /className=\{`folio-relative-measure \$\{measurement\.kind\}`\}/);
  assert.match(source, /measurement\.distance\} мм/);
});

test("ceiling plan supports wheel and button zoom without changing physical dimensions", () => {
  assert.match(source, /planZoom,setPlanZoom/);
  assert.match(source, /onWheel=\{zoomPlanWithWheel\}/);
  assert.match(source, /Уменьшить масштаб/);
  assert.match(source, /Увеличить масштаб/);
  assert.match(source, /50,Math\.min\(180/);
  assert.match(source, /room\.width\} × \$\{room\.length\} мм/);
});

test("technical lighting can be saved into an existing or a new project", () => {
  assert.match(source, /Сохранить проект/);
  assert.match(source, /Добавить в существующий/);
  assert.doesNotMatch(source, /disabled=\{!projects\.length\}/);
  assert.match(source, /Существующих проектов пока нет/);
  assert.match(source, /Создать новый/);
  assert.match(source, /\/technical-lighting`/);
  assert.match(source, /technicalLighting:\{room,ceilingPoints,ceilingPreset,tracks,fixtures,photo/);
  assert.match(projectLightingRoute, /ceilingPoints: safeCeilingPoints/);
  assert.match(homeSource, /\/technical-lighting\?project=\$\{encodeURIComponent\(projectId\)\}/);
});

test("lighting prompt carries strict inventory, marker mapping and ceiling-focused framing", () => {
  assert.match(source, /quantity:\[\.\.\.activeTracks/);
  assert.match(source, /fixtureItems=activeFixtures\.map/);
  assert.match(generationRoute, /Hard inventory constraint/);
  assert.match(generationRoute, /Numbered marker mapping/);
  assert.match(generationRoute, /Product colour is a hard constraint/);
  assert.match(generationRoute, /at least two thirds of the image/);
  assert.match(generationRoute, /strict non-rectangular polygon/);
  assert.match(generationRoute, /form\.append\("quality", "high"\)/);
});
