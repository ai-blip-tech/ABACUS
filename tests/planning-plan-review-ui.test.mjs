import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const editor=readFileSync(new URL('../app/measured-plan/editor/measure-app.tsx',import.meta.url),'utf8');
test('planning hides source review panels without changing the measured editor default',()=>{
 assert.match(editor,/workspace='measured'/);
 assert.match(editor,/!planning&&<details className="property-section global-settings"/);
 assert.match(editor,/!planning&&<details className="property-section"><summary>Общие толщины стен/);
 assert.match(editor,/!planning&&<details className="property-section"><summary>Размеры проёмов по высоте/);
 assert.match(editor,/!planning&&<section className="property-section completeness"/);
 assert.match(editor,/!planning\?\[\['checks','Проверка размеров'\]\]:\[\]/);
 assert.match(editor,/!planning&&doc.source.method==='raster-estimated'&&<div/);
});
test('planning keeps object edits but has no confirmation badges or review colouring',()=>{
 assert.match(editor,/!planning&&\(wall\|\|opening\)&&<span/);
 assert.match(editor,/!planning&&!opening&&wallMissing/);
 assert.match(editor,/!planning&&wall&&!opening&&doc.source.method==='raster-estimated'/);
 assert.match(editor,/stroke=\{planning\?'#302b27':missing/);
 for(const label of ['Чистая длина стены, мм','Толщина выбранной стены, мм','Высота выбранной стены, мм','Тип выбранной стены','Размеры по осевой линии'])assert.ok(editor.includes(label));
 assert.match(editor,/setStatus\(planning\?'Планировочное решение сохранено в проекте':problems.length/);
});
