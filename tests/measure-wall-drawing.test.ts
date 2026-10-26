import test from 'node:test';
import assert from 'node:assert/strict';
import {snapDrawingPoint,drawingLengthPoint} from '../lib/measured-plan/measure-wall-drawing.ts';
import type {Wall} from '../lib/measured-plan/measure-model.ts';
const walls=[{a:[0,0],b:[3000,0]},{a:[0,0],b:[0,2000]}] as Wall[];
test('drawing snaps exactly to existing endpoints',()=>{
 const r=snapDrawingPoint([2994,8],null,walls,20);
 assert.deepEqual(r.point,[3000,0]);assert.equal(r.label,'Конец стены');
});
test('drawing aligns remotely to the x coordinate of another wall',()=>{
 const r=snapDrawingPoint([3010,1700],[1000,1700],walls,20);
 assert.deepEqual(r.point,[3000,1700]);assert.equal(r.guides.length,2);
 assert.ok(r.guides.some(g=>g.axis==='x'&&g.source[0]===3000));
});
test('horizontal and vertical directions are exact before committing',()=>{
 assert.deepEqual(snapDrawingPoint([2000,180],[100,100],[],20).point,[2000,100]);
 assert.deepEqual(snapDrawingPoint([180,2000],[100,100],[],20).point,[100,2000]);
});
test('Alt preserves arbitrary position without snapping or guides',()=>{
 assert.deepEqual(snapDrawingPoint([2994,8],null,walls,20,true),{point:[2994,8],guides:[],label:''});
});
test('exact dimension preserves heading and rejects invalid lengths',()=>{
 assert.deepEqual(drawingLengthPoint([100,100],[100,500],3000),[100,3100]);
 assert.throws(()=>drawingLengthPoint([0,0],[0,0],1000));
 assert.throws(()=>drawingLengthPoint([0,0],[1,0],99));
 assert.throws(()=>drawingLengthPoint([0,0],[1,0],Infinity));
});
