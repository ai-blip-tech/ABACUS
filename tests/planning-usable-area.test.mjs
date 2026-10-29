import test from 'node:test';
import assert from 'node:assert/strict';
import {manualPlanning} from '../lib/planning-plan/model.ts';
import {usablePlanArea} from '../lib/planning-plan/usable-area.ts';
const near=(a,b)=>assert.ok(Math.abs(a-b)<.00001,`${a} != ${b}`);
function room(){const d=manualPlanning().plan;d.floor=[[0,0],[10000,0],[10000,8000],[0,8000]];d.walls=d.floor.map((a,i)=>({id:'w'+i,name:'w'+i,a,b:d.floor[(i+1)%4],thickness:200,group:'outer'}));return d;}
test('usable floor is inside faces, not axis or external gross area',()=>{const a=usablePlanArea(room());near(a.squareMetres,76.44);near(a.axisSquareMetres,80);});
test('partitions, overlapping wall ends and columns are subtracted once',()=>{const d=room();d.walls.push({id:'part',name:'part',a:[5000,0],b:[5000,8000],thickness:100,group:'inner'});d.columns=[{id:'c',a:[1000,1000],width:400,depth:400}];near(usablePlanArea(d).squareMetres,76.44-.78-.16);});
test('door thresholds are useful floor, windows remain wall/sill footprints',()=>{const d=room();d.openings=[{id:'door',wallId:'w0',kind:'door',offset:2000,width:900,sill:0}];near(usablePlanArea(d).squareMetres,76.44+.18);d.openings.push({id:'window',wallId:'w0',kind:'window',offset:5000,width:1800,sill:800});near(usablePlanArea(d).squareMetres,76.62);});
test('furniture does not reduce useful floor, and missing contour is unknown',()=>{const d=room(),before=usablePlanArea(d).squareMetres;d.furniture=[{position:[1000,2000],width:900,depth:800}];near(usablePlanArea(d).squareMetres,before);d.floor=[];assert.equal(usablePlanArea(d).squareMetres,null);});
