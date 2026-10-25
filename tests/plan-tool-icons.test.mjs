import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('both plan editors share the original ruler and dimension icons',()=>{
 const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
 const icons=read('app/plan-tool-icons.tsx');
 assert.ok(icons.includes('m3 16 13-13 5 5L8 21zM7 12l3 3M10 9l2 2M13 6l3 3'));
 assert.ok(icons.includes('M4 5v14M20 5v14M4 12h16M8 9l-4 3 4 3M16 9l4 3-4 3'));
 for(const path of ['app/measured-plan/editor/measure-app.tsx','app/partition-plan/partition-toolbar.tsx']){const source=read(path);assert.match(source,/import \{PlanRulerIcon,PlanDimensionIcon[^}]*\} from .*plan-tool-icons/);assert.ok(source.includes('<PlanRulerIcon/>'));assert.ok(source.includes('<PlanDimensionIcon/>'));}
 const toolbar=read('app/partition-plan/partition-toolbar.tsx');assert.ok(toolbar.includes('<MeasureToolsMenu'));
 const labels=['Отменить действие','Повторить действие','Линейка','Дополнительный размер','Добавить дверь','Добавить окно','Возвести перегородку','Уменьшить план'];let previous=-1;for(const label of labels){const index=toolbar.indexOf('aria-label="'+label+'"');assert.ok(index>previous,label+' must keep measured-plan order');previous=index;}
 for(const label of ['↔ Масштаб','⌑ Контур пола','▱ Зона высот'])assert.match(toolbar,new RegExp('<button disabled[^>]*>'+label));
});
