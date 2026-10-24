import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDoc} from '../lib/measured-plan/measure-model.ts';
import {thicknessNotes,openingWidthMarks,planDrawingDimensions} from '../lib/measured-plan/measure-annotations.ts';
import {clearDimensions} from '../lib/measured-plan/measure-model.ts';
import {exteriorDoorDirection,doorSymbol} from '../lib/measured-plan/measure-editing.ts';
const sample=()=>fixtureDoc({name:'test',mime:'image/png',hash:'test',width:100,height:100,page:1,pages:1,method:'prepared-user-bti',image:'',words:[],pixelScale:1});
test('print and editor share only the plan dimension list, never implicit per-wall lengths',()=>{const d=sample();d.dimensions=[{id:'manual',a:[0,0],b:[500,1200]}];const marks=planDrawingDimensions(d),room=clearDimensions(d);assert.equal(marks.length,room.length+1);assert.deepEqual(marks.filter(m=>m.kind==='room').map(m=>[m.a,m.b,m.value]),room.map(m=>[m.a,m.b,Math.hypot(m.b[0]-m.a[0],m.b[1]-m.a[1])]));assert.equal(marks.at(-1)!.value,1300);d.source.method='manual';assert.deepEqual(planDrawingDimensions(d).map(m=>m.id),['manual']);});
test('every window, door and empty passage has an exact width between its edges',()=>{
 const d=sample(),before=JSON.stringify(d),marks=openingWidthMarks(d,180);assert.equal(marks.length,d.openings.length);
 for(const mark of marks){const opening=d.openings.find(o=>o.id===mark.id)!;assert.ok(Math.abs(Math.hypot(mark.a[0]-mark.b[0],mark.a[1]-mark.b[1])-opening.width)<.001);assert.equal(mark.label,`${Math.round(opening.width)} мм`);assert.ok(Math.abs(Math.hypot(mark.da[0]-mark.db[0],mark.da[1]-mark.db[1])-opening.width)<.001);}
 assert.equal(JSON.stringify(d),before);
});
test('thickness notes show defaults and numbered exceptions, never infer load bearing',()=>{
 const d=sample();d.walls.forEach(w=>{w.thickness=w.group==='outer'?400:100;w.thicknessConfirmed=true;});d.walls[11].thickness=200;
 const notes=thicknessNotes(d);assert.ok(notes.some(n=>n.includes('400 мм')));assert.ok(notes.some(n=>n.includes('100 мм')));assert.ok(notes.some(n=>n.includes('№ 12')&&n.includes('200 мм')));assert.ok(notes.every(n=>!n.includes('несущ')));
});
test('missing/unconfirmed thicknesses remain explicit rather than silently certified',()=>{const d=sample();d.walls[0].thickness=NaN;const notes=thicknessNotes(d);assert.ok(notes.some(n=>n.includes('не задана')));assert.ok(notes.some(n=>n.includes('проверить обмер')));});
test('entrance fixture opens outside; exterior default is stable when wall endpoints reverse',()=>{const d=sample(),o=d.openings.find(o=>o.id==='door_bti_entry')!,w=d.walls.find(w=>w.id===o.wallId)!;assert.equal(o.swingDirection,'outward');assert.ok(doorSymbol(w,o).leaf[1]<w.a[1]);assert.equal(exteriorDoorDirection(d,w),'outward');assert.equal(exteriorDoorDirection(d,{...w,a:w.b,b:w.a}),'inward');});
