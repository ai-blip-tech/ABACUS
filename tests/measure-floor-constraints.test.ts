import test from 'node:test';
import assert from 'node:assert/strict';
import {constrainFloorPoint,constrainFloorEdit,floorPolygonInside} from '../lib/measured-plan/measure-floor-constraints.ts';
import type {MultiPolygon} from 'polygon-clipping';
import type {Point} from '../lib/measured-plan/measure-model';
const surface:MultiPolygon=[[[[100,100],[3900,100],[3900,2900],[100,2900],[100,100]]]];
test('floor points snap to the clean inner face and corner, never to the wall axis or outside',()=>{
 assert.deepEqual(constrainFloorPoint([30,1500],surface,120),[100,1500]);
 assert.deepEqual(constrainFloorPoint([180,170],surface,120),[100,100]);
 assert.deepEqual(constrainFloorPoint([3800,1500],surface,120),[3900,1500]);
 assert.deepEqual(constrainFloorPoint([6000,1500],surface,120),[3900,1500]);
 assert.deepEqual(constrainFloorPoint([1000,1500],surface,120),[1000,1500]);
});
test('floor drag cannot jump through an internal wall into another room or cross a column',()=>{
 const rooms:MultiPolygon=[[[[100,100],[1900,100],[1900,2900],[100,2900],[100,100]]],[[[2100,100],[3900,100],[3900,2900],[2100,2900],[2100,100]]]];
 assert.deepEqual(constrainFloorPoint([3000,1500],rooms,0,[1000,1500]),[1900,1500]);
 const column:MultiPolygon=[surface[0].concat([[[1500,1000],[2000,1000],[2000,2000],[1500,2000],[1500,1000]]])];
 assert.deepEqual(constrainFloorPoint([3000,1500],column,0,[1000,1500]),[1500,1500]);
 assert.equal(floorPolygonInside([[1000,500],[2500,500],[2500,2500],[1000,2500]],column),false);
});
test('moving a floor edge or whole region stops at the wall while preserving its shape',()=>{
 const p:Point[]=[[500,500],[1500,500],[1500,1500],[500,1500]];
 assert.deepEqual(constrainFloorEdit(p,'edge',1,[4000,0],surface,120),[[500,500],[3900,500],[3900,1500],[500,1500]]);
 assert.deepEqual(constrainFloorEdit(p,'move',0,[-2000,0],surface,120),[[100,500],[1100,500],[1100,1500],[100,1500]]);
 assert.deepEqual(constrainFloorEdit(p,'vertex',0,[-600,-600],surface,120)[0],[100,100]);
});
