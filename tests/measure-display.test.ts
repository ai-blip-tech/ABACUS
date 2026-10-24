import test from 'node:test';
import assert from 'node:assert/strict';
import {wallJoins,wallBodies} from '../lib/measured-plan/measure-display.ts';
import type {Point,Wall} from '../lib/measured-plan/measure-model.ts';
const wall=(id:string,a:Point,b:Point,thickness=200):Wall=>({id,name:id,a,b,thickness,thicknessConfirmed:true,lengthConfirmed:true,height:2800,group:'outer',provenance:'test'});
test('T junction trims raster overshoot to carrier without changing stored dimensions',()=>{
 const input=[wall('carrier',[100,0],[100,4000],100),wall('branch',[4,2000],[3000,2000],100)],copy=JSON.stringify(input);
 assert.ok(Math.hypot(wallBodies(input)[1].a[0]-100,wallBodies(input)[1].a[1]-2000)<1e-8);assert.equal(JSON.stringify(input),copy);
});
test('L junction has rectangular infill and no projecting ends in all endpoint directions',()=>{
 for(const reverse of [false,true]){const input=[wall('v',[100,0],[100,4096],100),wall('h',[4,4000],[3000,4000],100)];if(reverse)for(const w of input)[w.a,w.b]=[w.b,w.a];const bodies=wallBodies(input);assert.ok(Math.abs(bodies[0][reverse?'a':'b'][1]-4000)<1e-8);assert.ok(Math.abs(bodies[1][reverse?'b':'a'][0]-100)<1e-8);assert.equal(wallJoins(bodies).length,1);}
});
test('wall bodies preserve real gaps, free ends, long crosses and parallel walls',()=>{
 for(const input of [[wall('a',[100,0],[100,4000]),wall('b',[201,2000],[3000,2000])],[wall('a',[100,0],[100,4000]),wall('b',[-3000,2000],[3000,2000])],[wall('a',[0,0],[0,4000]),wall('b',[100,0],[100,4000])]])assert.deepEqual(wallBodies(input),input);
});
test('unequal perpendicular walls fill the missing exterior quadrant without editing measurements',()=>{const walls=[wall('a',[0,0],[5000,0],300),wall('b',[0,0],[0,4000],500)],original=JSON.stringify(walls);const joins=wallJoins(walls);assert.equal(joins.length,1);assert.deepEqual(joins[0].polygon,[[0,0],[0,-150],[-250,-150],[-250,0]]);assert.equal(JSON.stringify(walls),original);});
test('free ends and genuine endpoint gaps are not cosmetically closed',()=>{assert.deepEqual(wallJoins([wall('a',[0,0],[5000,0])]),[]);assert.deepEqual(wallJoins([wall('a',[0,0],[5000,0]),wall('b',[5001,0],[5001,4000])]),[]);});
test('straight collinear walls need no exterior infill',()=>{assert.deepEqual(wallJoins([wall('a',[0,0],[5000,0]),wall('b',[5000,0],[7000,0])]),[]);});
test('both endpoint orientations produce the same rectangular outer corner',()=>{for(const reverseA of [false,true])for(const reverseB of [false,true]){const a=wall('a',reverseA?[5000,0]:[0,0],reverseA?[0,0]:[5000,0],300),b=wall('b',reverseB?[0,4000]:[0,0],reverseB?[0,0]:[0,4000],500);assert.ok(wallJoins([a,b])[0].polygon.some(p=>p[0]===-250&&p[1]===-150));}});
test('angled joins are finite and acute corners bevel rather than spike',()=>{const a=wall('a',[0,0],[5000,0]);for(const endpoint of [[3000,3000],[5000,1]] as Point[]){const joins=wallJoins([a,wall('b',[0,0],endpoint)]);assert.equal(joins.length,1);assert.ok(joins[0].polygon.every(p=>p.every(Number.isFinite)));assert.ok(joins[0].polygon.every(p=>Math.hypot(...p)<=400));}assert.equal(wallJoins([a,wall('b',[0,0],[5000,1])])[0].polygon.length,3);});
test('invalid zero-length candidate does not produce NaN geometry',()=>{assert.deepEqual(wallJoins([wall('a',[0,0],[0,0]),wall('b',[0,0],[5000,0])]),[]);});
