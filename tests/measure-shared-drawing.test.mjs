import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('both editors share the continuous wall drawing implementation, with installation guard',()=>{
 const measured=readFileSync('app/measured-plan/editor/measure-app.tsx','utf8');
 const partition=readFileSync('app/partition-plan/page.tsx','utf8');
 const toolbar=readFileSync('app/partition-plan/partition-toolbar.tsx','utf8');
 assert.match(measured,/<MeasureWallDrawing /);assert.match(partition,/<MeasureWallDrawing /);
 assert.match(partition,/!doc.baseLocked\|\|mode==='installation'/);assert.match(partition,/onCommit=\{commitDrawnPartition\}/);
 assert.match(toolbar,/aria-label="Стена"/);assert.match(toolbar,/<PlanWallIcon\/>/);assert.match(measured,/onClick=\{\(\)=>selectTool\('wall'\)\}>＋ Стена/);
 assert.match(measured,/<button disabled title="Система рассчитывает контур пола автоматически/);
});
