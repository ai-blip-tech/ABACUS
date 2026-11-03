import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rulerEnd,rulerLength,rulerAngle,snapMeasurePoint,dimensionOffset,offsetDimension} from '../lib/measured-plan/measure-ruler.ts';

test('measurement snaps to wall faces, endpoints and midpoints without changing source walls',()=>{
 const walls:Wall[]=[{id:'w',name:'w',a:[0,0],b:[4000,0],thickness:200,height:2800,group:'inner',lengthConfirmed:true,thicknessConfirmed:true,provenance:'test'}];
 assert.deepEqual(snapMeasurePoint([1230,110],walls,30).point,[1230,100]);
 assert.deepEqual(snapMeasurePoint([1990,110],walls,30).point,[2000,100]);
 assert.deepEqual(snapMeasurePoint([5,-105],walls,30).point,[0,-100]);
 assert.deepEqual(snapMeasurePoint([5,-105],walls,30,true).point,[5,-105]);assert.deepEqual(walls[0].a,[0,0]);
});
test('offset dimensions preserve the measured length and report the actual angle',()=>{
 const a:[number,number]=[0,0],b:[number,number]=[3000,4000],offset=dimensionOffset(a,b,[-400,300]),result=offsetDimension(a,b,offset);
 assert.equal(offset,500);assert.equal(rulerLength(result.a,result.b),5000);assert.ok(Math.abs(rulerAngle(a,b)-53.130102)<.00001);assert.equal(rulerAngle([0,0],[0,-100]),270);
});
import type {Point,Wall} from '../lib/measured-plan/measure-model.ts';
test('ruler measures arbitrary distances in model millimetres',()=>{assert.equal(rulerLength([0,0],[3000,4000]),5000);assert.equal(rulerLength([-200,100],[-200,100]),0);});
test('horizontal and perpendicular snapping preserves distance and fixed anchor',()=>{const a:Point=[500,700],copy=[...a];const p=rulerEnd(a,[3500,720],[]);assert.equal(p[1],700);assert.ok(Math.abs(rulerLength(a,p)-Math.hypot(3000,20))<1e-8);assert.deepEqual(a,copy);const vertical=rulerEnd(a,[520,3700],[]);assert.ok(Math.abs(vertical[0]-500)<1e-8);});
test('snaps parallel and perpendicular to angled existing walls; Alt bypasses snap',()=>{const walls:Wall[]=[{id:'w',name:'w',a:[0,0],b:[1000,1000],thickness:200,height:2800,group:'inner',lengthConfirmed:false,thicknessConfirmed:false,provenance:'test'}];const a:Point=[0,0];const parallel=rulerEnd(a,[1000,1020],walls);assert.ok(Math.abs(parallel[0]-parallel[1])<1e-8);const perpendicular=rulerEnd(a,[-1020,1000],walls);assert.ok(Math.abs(perpendicular[0]+perpendicular[1])<1e-8);assert.deepEqual(rulerEnd(a,[1000,1020],walls,true),[1000,1020]);assert.deepEqual(rulerEnd(a,[1200,500],[]),[1200,500]);});
test('ruler is isolated from document writes and intercepts wall interaction',()=>{const ui=readFileSync(new URL('../app/measured-plan/editor/measure-ruler.tsx',import.meta.url),'utf8');assert.doesNotMatch(ui,/setDoc|onSave|fetch\(/);assert.match(ui,/setPointerCapture/);assert.match(ui,/stopPropagation/);assert.match(ui,/data-ruler-end/);const app=readFileSync(new URL('../app/measured-plan/editor/measure-app.tsx',import.meta.url),'utf8');assert.match(app,/aria-label="Линейка"/);assert.match(app,/Новое измерение/);assert.match(app,/Закрыть линейку/);});
test('ruler uses thin end marks and Escape exits both measurement tools',()=>{const ruler=readFileSync(new URL('../app/measured-plan/editor/measure-ruler.tsx',import.meta.url),'utf8');assert.doesNotMatch(ruler,/<circle|А · закреплена/);assert.match(ruler,/DimensionMark/);const app=readFileSync(new URL('../app/measured-plan/editor/measure-app.tsx',import.meta.url),'utf8');assert.match(app,/tool==='ruler'\|\|tool==='dimension'/);});
