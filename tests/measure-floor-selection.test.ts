import test from 'node:test';
import assert from 'node:assert/strict';
import {blankDoc,type Point,type Wall} from '../lib/measured-plan/measure-model.ts';
import {selectFloorByRectangle} from '../lib/measured-plan/measure-floor-selection.ts';
import {floorRegionGeometry} from '../lib/measured-plan/measure-floor-finishes.ts';
import {usablePlanArea} from '../lib/planning-plan/usable-area.ts';
function doc(){const d=blankDoc({name:'test',mime:'image/png',hash:'',width:1,height:1,page:1,pages:1,method:'test',image:'',words:[],pixelScale:1});d.floor=[[0,0],[4000,0],[4000,3000],[0,3000]];return d;}
const wall=(id:string,a:Point,b:Point):Wall=>({id,name:id,a,b,thickness:200,height:2700,group:'inner',lengthConfirmed:true,thicknessConfirmed:true,provenance:'test'});
test('one marquee reconstructs an L-shaped floor with all recesses in either drag direction',()=>{
 const d=doc();d.floor=[[0,0],[4000,0],[4000,1000],[2000,1000],[2000,3000],[0,3000]];const before=JSON.stringify(d),a:Point=[-500,-500],b:Point=[4500,3500];
 const forward=selectFloorByRectangle(d,a,b),reverse=selectFloorByRectangle(d,b,a);
 assert.equal(forward.squareMetres,8);assert.deepEqual(forward,reverse);assert.equal(forward.regions.length,1);assert.equal(forward.regions[0].length,6);assert.equal(JSON.stringify(d),before);
});
test('marquee cuts exactly at wall faces and excludes column footprints without losing them on save',()=>{
 const d=doc();d.walls=[wall('n',[0,0],[4000,0]),wall('e',[4000,0],[4000,3000]),wall('s',[4000,3000],[0,3000]),wall('w',[0,3000],[0,0])];d.columns=[{id:'c',name:'К1',a:[500,500],width:400,depth:400,height:2700,confirmed:true,structuralStatus:'bearing',provenance:'test'}];
 const selected=selectFloorByRectangle(d,[-500,-500],[4500,3500]);assert.ok(Math.abs(selected.squareMetres-10.48)<1e-8);assert.equal(selected.polygons[0].length,2);
 const restored=floorRegionGeometry(d,{id:'floor',polygon:JSON.parse(JSON.stringify(selected.regions[0])),layout:'chevron',wood:'oak'});assert.equal(restored.squareMetres,selected.squareMetres);assert.equal(restored.polygons[0].length,2);
});
test('a frame crossing a partition creates separate editable regions in one selection',()=>{
 const d=doc();d.walls=[wall('partition',[2000,0],[2000,3000])];const selection=selectFloorByRectangle(d,[-200,-200],[4200,3200]);assert.equal(selection.regions.length,2);assert.equal(selection.squareMetres,usablePlanArea(d).squareMetres);
});
test('partial selection respects the frame; outside, empty and tiny selections add nothing',()=>{
 const d=doc();assert.equal(selectFloorByRectangle(d,[0,0],[1000,1000]).squareMetres,1);for(const [a,b] of [[[5000,0],[6000,1000]],[[1000,1000],[1000,2000]],[[1000,1000],[1001,1001]]] as [Point,Point][])assert.equal(selectFloorByRectangle(d,a,b).regions.length,0);
 assert.throws(()=>selectFloorByRectangle(d,[NaN,0],[1000,1000]));
});

test('a rough frame around most of a complex room fills its entire contour without corner hunting',()=>{
 const d=doc();d.floor=[[0,0],[4000,0],[4000,1000],[2000,1000],[2000,3000],[0,3000]];
 const result=selectFloorByRectangle(d,[100,100],[3900,2900]);assert.equal(result.squareMetres,8);assert.equal(result.regions[0].length,6);
});
