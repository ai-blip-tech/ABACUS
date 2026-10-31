import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const page=await readFile(new URL('../app/materials-concept/page.tsx',import.meta.url),'utf8');
const route=await readFile(new URL('../app/api/projects/[id]/materials-concept/route.ts',import.meta.url),'utf8');
const workbench=await readFile(new URL('../app/templates/[slug]/template-scenario-workbench.tsx',import.meta.url),'utf8');
const css=await readFile(new URL('../app/materials-concept/materials-concept.css',import.meta.url),'utf8');

test('materials concept loads and saves the authenticated project with revision protection',()=>{
 assert.match(page,/\/materials-concept'/);
 assert.match(page,/serverRevision\.current/);
 assert.match(page,/Проект сохранён на сервере/);
 assert.doesNotMatch(page,/Боевые проекты не изменялись/);
 assert.match(route,/material_boards/);
 assert.match(route,/old\?\.revision\|\|0/);
 assert.match(route,/Проект изменён в другой вкладке/);
 assert.match(route,/isSameOrigin/);
});

test('kitchen visual action remains actionable after a result and uses the burgundy treatment',()=>{
 assert.match(workbench,/disabled=\{phase === "processing"\}/);
 assert.match(css,/\.concept-kitchen-workspace \.editorial-create-button\{background:var\(--concept-red\)/);
 assert.match(css,/\.concept-kitchen-workspace \.editorial-create-button:hover\{background:#781027/);
});
