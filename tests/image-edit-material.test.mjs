import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("free-text edit targets the current full image rather than the last placed object", () => {
  assert.doesNotMatch(page, /lastPlacementPoint|adjustLastPlacement/);
  assert.match(page, /const editCurrentImage[\s\S]*?globalEdit:\{instruction:placementPrompt\}/);
  assert.doesNotMatch(page.match(/const editCurrentImage[\s\S]*?const applyMaterial/)?.[0] || "", /adjustment:|createPlacementMask/);
  assert.match(page, /ЧТО ИЗМЕНИТЬ\?/);
  assert.match(page, /сделай кресло зелёным, убери торшер или добавь человека в кресло/);
  assert.match(page, /Применить изменения/);
  assert.match(route, /body\.globalEdit \? "global_edit"/);
  assert.match(route, /body\.roomImage && body\.globalEdit\?\.instruction/);
  assert.match(route, /image\[\]", dataUrlToBlob\(body\.roomImage\), "current-interior\.png"/);
});

test("material brush is selection-gated and uses a distinct point-guided material operation", () => {
  assert.match(page, /activeTool === "Добавить мебель" && interiorImage && placementPoint&&<div className="material-tool"/);
  assert.match(page, /type MaterialSelection = \{ point:\{x:number;y:number\}; roomImage:string \}/);
  assert.match(page, /const enterMaterialMode[\s\S]*?setMaterialSelection\(\{point,roomImage:source\}\)[\s\S]*?setMaterialMenuOpen\(true\)/);
  assert.match(page, /aria-label="Изменить материал выбранной поверхности"/);
  assert.match(page, /materialInputRef\.current\?\.click\(\)[\s\S]*?>Загрузить референс<\/button>/);
  assert.match(page, /material-catalog-action[\s\S]*?>Добавить из каталога<\/button>/);
  assert.match(page, /Каталог материалов готовится\./);
  assert.match(page, /type="file" accept="image\/png,image\/jpeg,image\/webp"[^>]*onChange=\{\(event\)=>loadMaterialReference/);
  assert.match(page, /const loadMaterialReference[\s\S]*?void applyMaterial\(String\(reader\.result\),file\.name\)/);
  assert.match(page, /const applyMaterial[\s\S]*?const selection=materialSelection[\s\S]*?createPointMarkerImage\(roomImage,selection\.point\)/);
  assert.match(page, /const applyMaterial[\s\S]*?operation:"material"/);
  assert.match(page, /const applyMaterial[\s\S]*?roomImage,referenceImage:materialReference,pointEdit,material:\{instruction:/);
  assert.doesNotMatch(page.match(/const applyMaterial[\s\S]*?const detectObjects/)?.[0] || "", /placement:|replacement:|removal:|furnitureAction/);
  assert.doesNotMatch(page.match(/const applyMaterial[\s\S]*?const detectObjects/)?.[0] || "", /getSurfaceMask|prepareLocalEdit|\/api\/segment|mask:/);
  assert.match(page, /const applyMaterial[\s\S]*?setActiveTool\("Добавить мебель"\)/);
  assert.match(route, /requestedOperation !== inferredOperation/);
  assert.match(route, /Material operation не может выполнять добавление, замену или удаление объекта/);
  assert.match(route, /body\.roomImage && body\.pointEdit\?\.markedImage && body\.referenceImage && body\.material/);
  assert.match(route, /"clean-interior\.png"/);
  assert.match(route, /"marked-interior\.png"/);
  assert.match(route, /`material-reference\./);
  assert.doesNotMatch(route.match(/body\.roomImage && body\.pointEdit\?\.markedImage && body\.referenceImage && body\.material[\s\S]*?body\.roomImage && body\.globalEdit/)?.[0] || "", /form\.append\("mask"/);
  assert.match(route, /Do not add, insert, copy, reconstruct, or reproduce the object depicted in the reference\./);
  assert.doesNotMatch(route.match(/body\.roomImage && body\.referenceImage && body\.material[\s\S]*?body\.roomImage && body\.globalEdit/)?.[0] || "", /replacementPrompt/);
  assert.match(css, /\.material-menu\{width:116px;[^}]*padding:4px[^}]*gap:1px/);
  assert.match(css, /\.material-menu button\{[^}]*padding:5px[^}]*font-size:8\.5px[^}]*font-weight:600/);
});

test("Add, Replace, Remove and Material point paths never call segmentation", () => {
  assert.doesNotMatch(page, /fetch\("\/api\/segment"/);
  assert.match(page, /const generate[\s\S]*?pointEdit[\s\S]*?operation:replacement\?"replace":placement\?"place":undefined/);
  assert.match(page, /const removeAtPlacement[\s\S]*?pointEdit[\s\S]*?operation:"remove"/);
  assert.match(page, /const applyMaterial[\s\S]*?pointEdit[\s\S]*?operation:"material"/);
  assert.match(page, /const createPointMarkerImage/);
  assert.doesNotMatch(route, /ROBOFLOW|fallback ellipse|segmentation/i);
});

test("point-guided failures always release the Editor loading state", () => {
  assert.match(page, /const generate[\s\S]*?finally \{ setIsGenerating\(false\); \}/);
  assert.match(page, /const generateFurnitureEdits[\s\S]*?finally\{setIsGenerating\(false\);\}/);
  assert.match(page, /const removeAtPlacement[\s\S]*?finally\{setIsGenerating\(false\);\}/);
  assert.match(page, /const applyMaterial[\s\S]*?finally\{setIsGenerating\(false\);\}/);
});

test("existing Add, Replace and Remove controls remain present", () => {
  assert.match(page, /aria-label="Действие с мебелью"/);
  assert.match(page, />Добавить<\/button>/);
  assert.match(page, />Заменить<\/button>/);
  assert.match(page, />Удалить<\/button>/);
});
