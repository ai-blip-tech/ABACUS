import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
test('print uses reference approval/inventory/revision tables without reference drawing or personal data',()=>{
 const ref=JSON.parse(readFileSync(new URL('lib/measured-plan/print-frame-reference.json',root),'utf8'));
 const labels=ref.characters.map((c:unknown[])=>c[0]).join('');
 for(const text of ['Изм.','Лист','№ док.','Подпись','Дата','Согласовано','Инв. № подл.','Подп. и дата','Взам. инв. №'])assert.ok(labels.includes(text),text);
 assert.ok(ref.segments.length>=30);assert.equal(ref.width,1190.52);assert.ok(!/Витрина|ARTPLAY|2026|Номер проекта/.test(labels));
});
test('print keeps required notes and title while removing construction prohibition',()=>{
 const frame=readFileSync(new URL('lib/measured-plan/print-frame.ts',root),'utf8'),route=readFileSync(new URL('app/api/projects/[id]/measured-plan/print/route.ts',root),'utf8');
 assert.ok(frame.includes('Все размеры уточняются замером.'));assert.ok(frame.includes('Обмерный план'));assert.ok(route.includes('drawMeasuredFrame(page,font)'));assert.ok(route.includes('drawMeasuredNotes(page,font'));
 assert.ok(!route.includes('не для строительных работ'));assert.ok(!route.includes('isReady(doc)'));
});
