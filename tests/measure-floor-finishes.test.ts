import test from 'node:test';
import assert from 'node:assert/strict';
import {editFloorPolygon,floorPolygon,floorRegionGeometry,parquetLayouts,validateFloorRegions,type FloorRegion} from '../lib/measured-plan/measure-floor-finishes.ts';
import {blankDoc,type Wall} from '../lib/measured-plan/measure-model.ts';
import {historyReducer,initialHistory} from '../lib/measured-plan/measure-history.ts';
const region:FloorRegion={id:'floor_test',polygon:[[0,0],[4000,0],[4000,3000],[0,3000]],layout:'herringbone',wood:'oak'};
const wall=(id:string,a:[number,number],b:[number,number]):Wall=>({id,name:id,a,b,thickness:200,height:2700,group:'outer',lengthConfirmed:true,thicknessConfirmed:true,provenance:'test'});
function doc(){const d=blankDoc({name:'',mime:'image/png',hash:'',width:1,height:1,page:1,pages:1,method:'test',image:'',words:[],pixelScale:1});d.floor=region.polygon;d.walls=[wall('n',[0,0],[4000,0]),wall('e',[4000,0],[4000,3000]),wall('s',[4000,3000],[0,3000]),wall('w',[0,3000],[0,0])];return d;}
test('floor finish clips to clean wall faces, excludes columns, and never changes the source',()=>{const d=doc(),before=JSON.stringify(d);assert.ok(Math.abs(floorRegionGeometry(d,region).squareMetres-10.64)<.0001);d.columns=[{id:'c',name:'К1',a:[500,500],width:400,depth:400,height:2700,confirmed:true,structuralStatus:'bearing',provenance:'test'}];assert.ok(Math.abs(floorRegionGeometry(d,region).squareMetres-10.48)<.0001);delete d.columns;assert.equal(JSON.stringify(d),before);const outside={...region,polygon:[[5000,0],[6000,0],[6000,1000],[5000,1000]] as [number,number][]};assert.equal(floorRegionGeometry(d,outside).squareMetres,0);});
test('six layouts and two woods remain independent through serialization and undo',()=>{assert.equal(parquetLayouts.length,6);const d=doc();d.floorRegions=[region];const next={...d,floorRegions:[{...region,wood:'walnut' as const}]};const state=historyReducer({...initialHistory,present:d},{type:'set',value:next});assert.equal(state.present!.floorRegions![0].layout,'herringbone');assert.equal(state.present!.floorRegions![0].wood,'walnut');assert.equal(historyReducer(state,{type:'undo'}).present!.floorRegions![0].wood,'oak');assert.deepEqual(validateFloorRegions(JSON.parse(JSON.stringify(next.floorRegions))),next.floorRegions);assert.deepEqual(d.walls,next.walls);});
test('floor contour rejects crossings and invalid coordinates, accepts a closed concave shape',()=>{assert.throws(()=>floorPolygon([[0,0],[1000,1000],[0,1000],[1000,0]]),/пересекает/);assert.throws(()=>floorPolygon([[0,0],[NaN,0],[0,1000]]));assert.throws(()=>floorPolygon([[0,0],[10,0],[0,10]]),/мал/);assert.equal(floorPolygon([[0,0],[2000,0],[2000,1000],[1000,1000],[1000,2000],[0,2000],[0,0]]).length,6);assert.throws(()=>validateFloorRegions([{...region,layout:'unknown'}]));});

test('floor editing moves corners, edges normally, and whole regions without mutating the original',()=>{
 const p=structuredClone(region.polygon);
 assert.deepEqual(editFloorPolygon(p,'vertex',1,[500,0]),[[0,0],[4500,0],[4000,3000],[0,3000]]);
 assert.deepEqual(editFloorPolygon(p,'edge',1,[500,700]),[[0,0],[4500,0],[4500,3000],[0,3000]]);
 assert.deepEqual(editFloorPolygon(p,'move',0,[100,200]),[[100,200],[4100,200],[4100,3200],[100,3200]]);
 assert.deepEqual(p,region.polygon);
 assert.throws(()=>editFloorPolygon(p,'vertex',1,[-5000,2000]),/пересекает/);
 assert.throws(()=>editFloorPolygon(p,'edge',7,[0,10]));
});
test('a floor drag is one undo step; cancellation restores contour and finish',()=>{
 const d=doc();d.floorRegions=[structuredClone(region)];let h=historyReducer({...initialHistory,present:d},{type:'begin'});
 for(const delta of [100,200,300])h=historyReducer(h,{type:'set',value:{...d,floorRegions:[{...region,polygon:editFloorPolygon(region.polygon,'edge',1,[delta,0])}]}});
 assert.equal(h.past.length,0);const cancelled=historyReducer(h,{type:'cancel'});assert.deepEqual(cancelled.present,d);
 h=historyReducer(h,{type:'end'});assert.equal(h.past.length,1);assert.deepEqual(historyReducer(h,{type:'undo'}).present,d);
 assert.equal(h.present!.floorRegions![0].layout,region.layout);assert.equal(h.present!.floorRegions![0].wood,region.wood);
});
