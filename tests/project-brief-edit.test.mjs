import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {readBrief,writeBrief,BRIEF_FIELDS} from '../lib/project-brief.ts';
test('existing eight-field brief survives reopening and multiline editing',()=>{
 const text=BRIEF_FIELDS.map(([,label],i)=>`${label}: Значение ${i}\nвторая строка`).join('\n');
 assert.equal(writeBrief(readBrief(text)),text);
});
test('legacy description is preserved instead of being discarded',()=>{
 const text='Свободное описание старого проекта\nЕщё одна строка';
 const draft=readBrief(text);assert.equal(draft.other,text);assert.equal(writeBrief(draft),text);
 draft.budget='До 2 млн';assert.match(writeBrief(draft),/^Свободное описание/);assert.match(writeBrief(draft),/Бюджет и вилка: До 2 млн/);
});
test('brief has scoped metadata-only saving and conflict protection',async()=>{
 const route=await readFile(new URL('../app/api/projects/[id]/route.ts',import.meta.url),'utf8');
 const patch=route.slice(route.indexOf('export async function PATCH'),route.indexOf('export async function DELETE'));
 assert.match(patch,/requireTenantUser/);assert.match(patch,/isSameOrigin/);assert.match(patch,/user_id=\? AND tenant_id=\?/);assert.match(patch,/status:409/);assert.match(patch,/expectedUpdatedAt/);
 assert.doesNotMatch(patch,/state_json\s*=|storage\(\)|INSERT|DELETE FROM|UPDATE measured_plans/);
 const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');assert.match(page,/project-menu-edit-brief/);assert.match(page,/onBriefSaved=\{/);
 const ui=await readFile(new URL('../app/project-brief-editor.tsx',import.meta.url),'utf8');assert.match(ui,/method:'PATCH'/);assert.match(ui,/Отмена/);assert.match(ui,/onCancel/);assert.match(ui,/role="alert"/);
});
