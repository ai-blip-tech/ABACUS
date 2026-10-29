import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('selected furniture keeps editing and duplication without redundant sidebar controls',()=>{
 const html=readFileSync(new URL('../app/planning-plan/furniture-editor.tsx',import.meta.url),'utf8').split('export function FurnitureProperties(')[1];
 assert.match(html,/Ширина предмета, мм/);
 assert.match(html,/Повернуть на 90°/);
 assert.match(html,/Дублировать предмет<\/button><\/section>/);
 assert.doesNotMatch(html,/Удалить|· Delete|Шаблонные размеры|Перетаскивание/);
});
