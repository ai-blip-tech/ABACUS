import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticFloor,withAutomaticFloor} from '../lib/measured-plan/measure-auto-floor.ts';
import {polygonArea,type Point,type Wall,type MeasureDoc} from '../lib/measured-plan/measure-model.ts';
const wall=(a:Point,b:Point,id:string):Wall=>({id,name:id,a,b,thickness:100,thicknessConfirmed:false,lengthConfirmed:false,height:null,group:'inner',provenance:'test'});
const ring=(p:Point[])=>p.map((a,i)=>wall(a,p[(i+1)%p.length],String(i)));
test('automatic floor closes rectangle without manual points and ignores inner partitions',()=>{
 const walls=[...ring([[0,0],[4000,0],[4000,3000],[0,3000]]),wall([2000,0],[2000,2200],'inner')];
 const before=JSON.stringify(walls),floor=automaticFloor(walls).polygon;
 assert.equal(polygonArea(floor),12000000);assert.equal(floor.length,4);assert.equal(JSON.stringify(walls),before);
});
test('automatic floor preserves an L-shaped concave perimeter',()=>{
 const floor=automaticFloor(ring([[0,0],[6000,0],[6000,5000],[3000,5000],[3000,2000],[0,2000]])).polygon;
 assert.equal(polygonArea(floor),21000000);assert.equal(floor.length,6);
});
test('door and window gaps close only in inferred floor, not actual walls',()=>{
 const walls=[wall([0,0],[1500,0],'a'),wall([2500,0],[4000,0],'b'),wall([4000,0],[4000,3000],'c'),wall([4000,3000],[0,3000],'d'),wall([0,3000],[0,0],'e')];
 assert.equal(polygonArea(automaticFloor(walls).polygon),12000000);assert.equal(walls.length,5);
});
test('disconnected loops and open walls do not invent a convex enclosure',()=>{
 assert.equal(automaticFloor([wall([0,0],[4000,0],'a'),wall([4000,0],[4000,3000],'b'),wall([4000,3000],[1000,3000],'c')]).polygon.length,0);
 assert.equal(automaticFloor([...ring([[0,0],[4000,0],[4000,3000],[0,3000]]),...ring([[8000,0],[10000,0],[10000,2000],[8000,2000]]).map(w=>({...w,id:w.id+'b'}))]).polygon.length,0);
});
test('moving a wall recalculates floor; incomplete floor stays unconfirmed',()=>{
 const d={walls:ring([[0,0],[4000,0],[4000,3000],[0,3000]]),floor:[],floorConfirmed:true} as unknown as MeasureDoc;
 const first=withAutomaticFloor(d);assert.equal(polygonArea(first.floor),12000000);assert.equal(first.floorConfirmed,false);
 const next=withAutomaticFloor({...first,walls:ring([[0,0],[5000,0],[5000,3000],[0,3000]])},first);assert.equal(polygonArea(next.floor),15000000);
});
test('closed inner room does not masquerade as the entire apartment',()=>{
 const walls=[wall([0,0],[6000,0],'a'),wall([6000,0],[6000,5000],'b'),...ring([[1000,1000],[2000,1000],[2000,2000],[1000,2000]])];
 assert.equal(automaticFloor(walls).polygon.length,0);
});
test('isolated inner room does not invalidate a closed exterior perimeter',()=>{
 const walls=[...ring([[0,0],[6000,0],[6000,5000],[0,5000]]),...ring([[1000,1000],[2000,1000],[2000,2000],[1000,2000]])];
 assert.equal(polygonArea(automaticFloor(walls).polygon),30000000);
});
test('T-junctions extend only the floor axes to the middle of a host segment',()=>{
 const walls=[wall([0,0],[4000,0],'a'),wall([4000,0],[4000,3000],'b'),wall([4000,3000],[0,3000],'c'),wall([0,60],[0,2940],'d'),wall([2000,60],[2000,2500],'e')];
 assert.equal(polygonArea(automaticFloor(walls).polygon),12000000);assert.deepEqual(walls[3].a,[0,60]);
});
test('independent columns bridge perimeter junctions without becoming walls',()=>{
 const walls=[wall([0,0],[3700,0],'a'),wall([4000,300],[4000,2700],'b'),wall([3700,3000],[0,3000],'c'),wall([0,0],[0,3000],'d')];
 const columns=[{id:'c1',a:[3700,-100],width:400,depth:400},{id:'c2',a:[3700,2700],width:400,depth:400}] as import('../lib/measured-plan/measure-model.ts').Column[];
 assert.ok(automaticFloor(walls,columns).polygon.length>=4);assert.equal(walls.length,4);
});
