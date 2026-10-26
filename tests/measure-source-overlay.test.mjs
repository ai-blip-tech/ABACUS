import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../app/measured-plan/editor/measure-app.tsx',import.meta.url),'utf8');
test('source overlay is a reversible view-only toggle next to the window tool',()=>{
 assert.match(source,/const \[showSourceOverlay,setShowSourceOverlay\]=useState\(true\)/);
 assert.match(source,/showSourceOverlay&&doc.source.method!=='prepared-user-bti'&&<image data-source-overlay/);
 assert.match(source,/onClick=\{\(\)=>setShowSourceOverlay\(v=>!v\)\}/);
 const button=source.indexOf("aria-label={showSourceOverlay?'Скрыть подложку исходника'");
 assert.ok(button>source.indexOf("aria-label={kind==='door'?'Добавить дверь':'Добавить окно'}"));
 assert.ok(button<source.indexOf('<div className="measure-zoom"'));
 assert.match(source,/tab==='source'\?<image href=\{doc.source.image\}/);
 assert.match(source,/disabled=\{tab!=='plan'\|\|doc.source.method==='prepared-user-bti'\}/);
});
