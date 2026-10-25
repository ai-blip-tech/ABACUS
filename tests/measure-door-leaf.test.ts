import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {doorSymbol,doorLeafWidth,openingMissing} from '../lib/measured-plan/measure-editing.ts';
import {blankDoc,type Wall,type Opening} from '../lib/measured-plan/measure-model.ts';
const w:Wall={id:'w',name:'w',a:[0,0],b:[5000,0],thickness:150,height:2800,group:'inner',provenance:'test',lengthConfirmed:true,thicknessConfirmed:true};
const o:Opening={id:'d',wallId:'w',kind:'door',width:900,offset:2000,height:2100,sill:0,confirmed:false};
test('900 mm opening has 800 mm leaf and arc with 50 mm frame allowance on each side',()=>{
 const s=doorSymbol(w,o);assert.equal(s.leafWidth,800);assert.equal(Math.hypot(s.leaf[0]-s.hinge[0],s.leaf[1]-s.hinge[1]),800);assert.deepEqual(s.hinge,[1600,0]);assert.deepEqual(s.closed,[2400,0]);assert.match(s.path,/A 800 800 /);assert.equal(o.width,900);
});
test('leaf difference remains 100 mm for every width, wall direction, hinge and swing',()=>{
 for(const width of [600,708,800,900,1000,1234])for(const b of [[5000,0],[0,5000],[-5000,0],[3000,4000]] as [number,number][])for(const hingesSide of ['left','right'] as const)for(const swingDirection of ['inward','outward'] as const){const s=doorSymbol({...w,b},{...o,width,hingesSide,swingDirection});for(const p of [s.leaf,s.closed])assert.ok(Math.abs(Math.hypot(p[0]-s.hinge[0],p[1]-s.hinge[1])-(width-100))<1e-8);}
});
test('printing uses the same leaf radius, never opening width, and widths remain opening dimensions',()=>{
 const print=readFileSync(new URL('../app/api/projects/[id]/measured-plan/print/route.ts',import.meta.url),'utf8');assert.match(print,/Math.cos\(a\)\*symbol.leafWidth/);assert.doesNotMatch(print,/Math.cos\([ab]\)\*o.width/);
});
test('invalid narrow door is flagged and never produces a negative radius',()=>{
 const doc=blankDoc({name:'test',mime:'image/png',hash:'x',width:100,height:100,page:1,pages:1,method:'test',image:'',words:[],pixelScale:1});doc.walls=[w];assert.equal(doorLeafWidth(100),0);assert.equal(doorSymbol(w,{...o,width:100}).path,'');assert.ok(openingMissing(doc,{...o,width:100}).some(x=>x.includes('больше 100')));
});
