import test from 'node:test';
import assert from 'node:assert/strict';
import {detectWalls,detectUpperOutline,estimatedRasterModel} from '../app/measured-plan/editor/measure-raster.ts';
import {wallJoins} from '../lib/measured-plan/measure-display.ts';
import {issues,polygonArea,type Source} from '../lib/measured-plan/measure-model.ts';
const source:Source={name:'No dimensions.png',mime:'image/png',hash:'not-a-fixture',width:400,height:600,page:1,pages:1,method:'',image:'/test.png',words:[],pixelScale:1};
function sample(){const data=new Uint8ClampedArray(400*600*4).fill(255);const rect=(x:number,y:number,w:number,h:number,gray:number)=>{for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const at=(yy*400+xx)*4;data[at]=data[at+1]=data[at+2]=gray;}};rect(35,40,12,165,65);rect(175,195,12,360,65);rect(345,40,12,515,65);rect(35,195,150,12,65);rect(175,545,180,12,65);rect(80,80,95,4,175);rect(80,160,95,4,175);return data;}
test('generic import filters pale furniture and merges wall stripes instead of creating 80 labels',()=>{const candidates=detectWalls(sample(),400,600);assert.ok(candidates.length>=4&&candidates.length<10);assert.ok(!candidates.some(c=>c.a[1]===80||c.a[1]===160));});
test('dimensionless drawing uses a uniform estimated scale preserving geometry ratios',()=>{const candidates=detectWalls(sample(),400,600),doc=estimatedRasterModel(source,candidates);assert.equal(doc.source.method,'raster-estimated');assert.ok(doc.source.pixelScale>1);for(let i=0;i<candidates.length;i++){const s=candidates[i],w=doc.walls[i];assert.ok(Math.abs((w.b[0]-w.a[0])-(s.b[0]-s.a[0])*doc.source.pixelScale)<2);assert.ok(Math.abs((w.b[1]-w.a[1])-(s.b[1]-s.a[1])*doc.source.pixelScale)<2);assert.equal(w.lengthConfirmed,false);assert.equal(w.thicknessConfirmed,false);}assert.ok(doc.floor.length>=6);const b=doc.floor.map(p=>p[0]),z=doc.floor.map(p=>p[1]);assert.ok(polygonArea(doc.floor)<(Math.max(...b)-Math.min(...b))*(Math.max(...z)-Math.min(...z))*.9);});
test('estimated sizes remain specific outstanding questions even when a height is supplied',()=>{const doc=estimatedRasterModel(source,detectWalls(sample(),400,600));doc.height=2800;doc.heightMode='uniform';const questions=issues(doc);assert.ok(questions.some(q=>q.wallId===doc.walls[0].id&&q.label.includes('подтвердите длину')));assert.ok(questions.some(q=>q.wallId===doc.walls[0].id&&q.label.includes('подтвердите толщину')));});
test('empty or unreadable image does not fabricate a complete apartment or floor',()=>{const doc=estimatedRasterModel(source,[]);assert.equal(doc.walls.length,0);assert.equal(doc.floor.length,0);assert.ok(issues(doc).some(q=>q.id==='walls'));});
test('pale supported perimeter retains two projections and a recess instead of a flat closure',()=>{
 const data=sample();const pixel=(x:number,y:number)=>{const p=(y*400+x)*4;data[p]=data[p+1]=data[p+2]=220;};
 const horizontal=(a:number,b:number,y:number)=>{for(let x=a;x<=b;x++){pixel(x,y);pixel(x,y+1);}};
 const vertical=(x:number,a:number,b:number)=>{for(let y=a;y<=b;y++){pixel(x,y);pixel(x+1,y);}};
 horizontal(41,65,30);vertical(65,15,30);horizontal(65,170,15);vertical(170,15,30);horizontal(170,220,30);vertical(220,15,30);horizontal(220,320,15);vertical(320,15,30);horizontal(320,351,30);
 const candidates=detectWalls(data,400,600),outline=detectUpperOutline(data,400,600,candidates);
 assert.ok(outline.length>=10);assert.ok(new Set(outline.map(p=>p[1])).size>=3);
 const doc=estimatedRasterModel(source,candidates,outline);assert.ok(doc.walls.length>candidates.length+1);
 assert.ok(doc.floor.some(p=>p[1]<30*doc.source.pixelScale));
 const before=JSON.stringify(doc.walls),joins=wallJoins(doc.walls);assert.ok(joins.length>=4);assert.ok(joins.every(j=>j.polygon.length===4),'Orthogonal corners must be rectangular, not bevelled');assert.equal(JSON.stringify(doc.walls),before);
});
test('missing light contour is not replaced with an unsupported flat wall',()=>{const data=sample(),candidates=detectWalls(data,400,600);assert.deepEqual(detectUpperOutline(data,400,600,candidates),[]);assert.equal(estimatedRasterModel(source,candidates).walls.length,candidates.length);});
