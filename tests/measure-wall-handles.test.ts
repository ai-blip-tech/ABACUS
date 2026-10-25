import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('wall endpoints are thin ticks with invisible hit zones, not visible circles',()=>{
 const ui=readFileSync(new URL('../app/measured-plan/editor/measure-wall-handles.tsx',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/<circle/);assert.match(ui,/data-wall-end-mark/);assert.match(ui,/strokeWidth="2" vectorEffect="non-scaling-stroke"/);assert.match(ui,/stroke="transparent" strokeWidth="24"/);assert.match(ui,/size=font\/zoom/);
 const clear=readFileSync(new URL('../app/measured-plan/editor/measure-clear-mark.tsx',import.meta.url),'utf8');assert.doesNotMatch(clear,/<circle/);
 const app=readFileSync(new URL('../app/measured-plan/editor/measure-app.tsx',import.meta.url),'utf8');assert.match(app,/<MeasureWallHandles wall=\{wall\}/);assert.match(app,/snapWallEdit\(latest,wd.id,wd.mode,tolerance\)/);
});
