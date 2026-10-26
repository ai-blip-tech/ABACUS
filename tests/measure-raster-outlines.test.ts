import test from 'node:test';
import assert from 'node:assert/strict';
import {outlineWallBands,outlineColumns,excludeColumnInteriors,type RasterSegment} from '../app/measured-plan/editor/measure-raster-outlines.ts';
import {detectRasterStructure,estimatedRasterModel} from '../app/measured-plan/editor/measure-raster.ts';
import {calibrate,bounds,type Source} from '../lib/measured-plan/measure-model.ts';
import {fromMeasured,visiblePlan,toggleDemolition} from '../lib/partition-plan/model.ts';
import {thicknessNotes} from '../lib/measured-plan/measure-annotations.ts';
const v=(x:number,a:number,b:number):RasterSegment=>({a:[x,a],b:[x,b],thickness:3});
const h=(y:number,a:number,b:number):RasterSegment=>({a:[a,y],b:[b,y],thickness:3});
test('two outlined faces become one body with centre axis and full thickness',()=>{
 const r=outlineWallBands([v(50,30,350),v(70,30,350),h(30,50,70),h(350,50,70)],400,400);
 assert.equal(r.bands.length,1);assert.deepEqual(r.bands[0],{a:[60,30],b:[60,350],thickness:23});
 assert.ok(!r.remaining.some(s=>s.a[0]===50&&s.b[0]===50&&s.b[1]===350));
});
test('disconnected faces and room-scale distances are not merged',()=>{
 assert.equal(outlineWallBands([v(50,30,350),v(70,30,350)],400,400).bands.length,0);
 assert.equal(outlineWallBands([v(50,30,350),v(270,30,350),h(30,50,270)],400,400).bands.length,0);
});
test('an interruption in both faces remains an opening, not a fabricated wall',()=>{
 const r=outlineWallBands([v(50,20,160),v(70,20,160),v(50,220,380),v(70,220,380),h(20,50,70),h(380,50,70)],400,400);
 assert.equal(r.bands.length,2);assert.ok(r.bands.every(s=>s.b[1]<=160||s.a[1]>=220));
});
test('closed enlarged column at a wall junction is independent, not four short walls',()=>{
 const data=new Uint8ClampedArray(400*400*4).fill(255),strokes=[h(40,270,310),h(80,270,310),v(270,40,80),v(310,40,80)];
 for(const s of strokes)for(let y=Math.max(0,s.a[1]-1);y<=s.b[1]+1;y++)for(let x=Math.max(0,s.a[0]-1);x<=s.b[0]+1;x++){const i=(y*400+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 const walls=[{...v(300,40,350),thickness:20},{...h(50,20,310),thickness:20}],columns=outlineColumns(data,400,400,strokes,walls);
 assert.equal(columns.length,1);const clipped=excludeColumnInteriors(walls,columns);assert.ok(clipped.filter(s=>s.a[0]===300&&s.b[0]===300).every(s=>s.a[1]>=80));
 assert.equal(outlineColumns(data,400,400,strokes,[]).length,0,'Furniture rectangle alone is not a column');
});
test('column metadata survives recalibration and both protected operation layers',()=>{
 const source:Source={name:'test.png',mime:'image/png',hash:'test',width:400,height:400,page:1,pages:1,method:'',image:'/test',words:[],pixelScale:1};
 const doc=estimatedRasterModel(source,[]);doc.columns=[{id:'column_test',name:'Колонна К1',a:[10,20],width:200,depth:300,height:null,confirmed:false,structuralStatus:'unknown',provenance:'test'}];
 const next=calibrate(doc,[0,0],[100,0],5000);assert.equal(next.columns![0].width,400);assert.equal(doc.columns[0].width,200);assert.ok(bounds(next).width>=400);
 assert.ok(thicknessNotes(doc).includes('К — колонна; цифра — номер колонны.'));
 const partition=fromMeasured(doc,1);for(const mode of ['demolition','installation'] as const)assert.deepEqual(visiblePlan(partition,mode).columns,doc.columns);
 assert.throws(()=>toggleDemolition(partition,'column_test'));assert.equal(doc.columns[0].structuralStatus,'unknown');
});
test('filled-wall and outlined-wall detector share the same one-body representation',()=>{
 const data=new Uint8ClampedArray(400*400*4).fill(255);
 for(const s of [v(50,30,350),v(70,30,350),h(30,50,70),h(350,50,70)])for(let y=s.a[1];y<=s.b[1]+2;y++)for(let x=s.a[0];x<=s.b[0]+2;x++){const i=(y*400+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 const found=detectRasterStructure(data,400,400);assert.equal(found.walls.filter(s=>s.a[0]===s.b[0]&&s.b[1]-s.a[1]>250).length,1);assert.ok(found.walls.some(s=>s.thickness>=20));
});
