import test from 'node:test';
import assert from 'node:assert/strict';
import {fixtureDoc} from '../lib/measured-plan/measure-model.ts';
import {wallNumberMarks} from '../lib/measured-plan/wall-number-layout.ts';
import {readFileSync} from 'node:fs';
const sample=()=>fixtureDoc({name:'test',mime:'image/png',hash:'test',width:100,height:100,page:1,pages:1,method:'prepared-user-bti',image:'',words:[],pixelScale:1});
test('dense short stepped contour labels never overlap at preview and paper scales',()=>{
 const d=sample();d.openings=[];const points:[[number,number],[number,number]][]=[[[0,0],[400,0]],[[400,0],[400,-120]],[[400,-120],[520,-120]],[[520,-120],[520,0]],[[520,0],[900,0]],[[900,0],[900,-120]],[[900,-120],[1020,-120]],[[1020,-120],[1020,0]]];
 d.walls=points.map(([a,b],i)=>({...d.walls[0],id:'step_'+i,a,b,thickness:70,group:'outer'}));d.floor=[[0,-200],[1100,-200],[1100,1200],[0,1200]];
 for(const f of [50,110,160]){const marks=wallNumberMarks(d,f);for(let i=0;i<marks.length;i++)for(let j=i+1;j<marks.length;j++){const a=marks[i].box,b=marks[j].box;assert.ok(!(a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom),`${f}: ${i}/${j}`);}}
});
test('editor uses the exact shared frame and never appends a length to the wall number',()=>{
 const app=readFileSync(new URL('../app/measured-plan/editor/measure-app.tsx',import.meta.url),'utf8');assert.match(app,/width=\{mark.halfWidth\*2\}/);assert.match(app,/fontSize=\{mark.fontSize\}/);assert.doesNotMatch(app,/font\*\(w.id===selected\?6.6/);
 const stage=app.slice(app.indexOf('<div className="measure-board">'),app.indexOf('<div className="measure-legend"'));assert.doesNotMatch(stage,/<circle/);assert.match(stage,/data-opening-grip/);assert.match(stage,/data-draft-point/);
});
test('every wall number is centered longitudinally and has an identical face-to-frame gap',()=>{const d=sample(),before=JSON.stringify(d);for(const m of wallNumberMarks(d,110)){const w=d.walls.find(w=>w.id===m.id)!,dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],size=Math.hypot(dx,dy);assert.ok(Math.abs((m.x-m.cx)*dx/size+(m.y-m.cy)*dy/size)<1e-6);const gap=Math.hypot(m.x-m.cx,m.y-m.cy)-w.thickness/2-Math.abs(m.nx)*m.halfWidth-Math.abs(m.ny)*m.halfHeight;assert.ok(Math.abs(gap-m.gap)<1e-6);}assert.equal(JSON.stringify(d),before);});
test('outer walls and the concave entrance boundary get outward labels',()=>{const marks=wallNumberMarks(sample(),110),by=(id:string)=>marks.find(m=>m.id==='wall_bti_'+id)!;assert.ok(by('north').ny<0);assert.ok(by('south').ny>0);assert.ok(by('east').nx>0);assert.ok(by('west').nx<0);assert.ok(by('west_niche').nx<0);assert.ok(by('west_step').ny<0);});
test('printed reference wall-number frames do not overlap each other',()=>{const marks=wallNumberMarks(sample(),6/(72/25.4/50));for(let i=0;i<marks.length;i++)for(let j=i+1;j<marks.length;j++){const a=marks[i].box,b=marks[j].box;assert.ok(!(a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom),`${marks[i].number} overlaps ${marks[j].number}`);}});
test('endpoint reversal preserves all placement decisions',()=>{const d=sample(),first=wallNumberMarks(d,110);d.walls=d.walls.map(w=>({...w,a:w.b,b:w.a}));/* Remove doors: hinge semantics intentionally change on reversal. */d.openings=[];const original=sample();original.openings=[];const a=wallNumberMarks(original,110),b=wallNumberMarks(d,110);assert.equal(first.length,b.length);for(let i=0;i<a.length;i++){assert.ok(Math.abs(a[i].x-b[i].x)<1e-6);assert.ok(Math.abs(a[i].y-b[i].y)<1e-6);}});
