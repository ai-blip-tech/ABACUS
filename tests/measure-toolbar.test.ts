import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../app/measured-plan/editor/measure-app.tsx',import.meta.url),'utf8');
test('wall inspector keeps essential measurements and confirmation without duplicate actions',()=>{
 assert.doesNotMatch(app,/label="Угол стены, °"|Повернуть на 90°|>Развернуть<|>＋ Дверь<|>＋ Окно<|>Удалить стену и её проёмы</);
 assert.match(app,/Тип выбранной стены/);assert.match(app,/Размеры по осевой линии/);assert.match(app,/Длина по оси стены, мм/);assert.match(app,/Размеры по рисунку ориентировочные/);assert.match(app,/Подтвердить размеры этой стены/);
});
test('toolbar exposes door and window placement next to measurement tools',()=>{
 const toolbar=app.slice(app.indexOf('<div className="measure-draw-tools">'),app.indexOf('aria-label="Масштаб плана"'));
 assert.match(toolbar,/aria-label="Линейка"/);assert.match(toolbar,/aria-label="Дополнительный размер"/);
 assert.match(toolbar,/Добавить дверь/);assert.match(toolbar,/Добавить окно/);
 assert.match(app,/placeOpeningOnWall\(w,svgPoint\(e\)\)/);
 assert.match(app,/moveOpening\(next,o.id,projectOnWall\(w,p\),10\)/);
});
test('Delete removes selected opening through undoable document change, not its wall',()=>{
 const removal=app.slice(app.indexOf('function removeSelectedOpening'),app.indexOf('function historyStep'));
 assert.match(removal,/change\(d=>/);assert.match(removal,/d.openings=d.openings.filter/);
 assert.doesNotMatch(removal,/deleteWall|d.walls=/);
 assert.match(app,/e.key==='Delete'\|\|e.key==='Backspace'\)&&opening&&tool==='select'/);
 const key=app.slice(app.indexOf('const key=(e:KeyboardEvent)'));
 assert.ok(key.indexOf("target.closest('input,textarea,select")<key.indexOf('removeSelectedOpening()'));
});
