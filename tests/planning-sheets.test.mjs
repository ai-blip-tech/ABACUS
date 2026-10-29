import test from 'node:test';
import assert from 'node:assert/strict';
import {manualPlanning,planningFromMeasured} from '../lib/planning-plan/model.ts';
import {createAlbum,saveVariant} from '../lib/planning-plan/variants.ts';
import {withManualSheets,switchManualSheet,switchManualSource,importManualDxf,manualSheetIndex} from '../lib/planning-plan/manual-workspace.ts';
import {newFurniture} from '../lib/planning-plan/furniture.ts';
function measured(){const p=manualPlanning().plan;p.walls=[{id:'w',name:'wall',a:[0,0],b:[4000,0],thickness:200,height:3000,group:'inner',thicknessConfirmed:true,lengthConfirmed:true,provenance:'test'}];return planningFromMeasured(p,2);}
const edit=(a,fn)=>{const p=structuredClone(a.variants.manual.plan);fn(p);return saveVariant(a,'manual',p,x=>x);};
test('migration retains existing edits on sheet 1, uses measured base for other two, and does not mutate source',()=>{
 const base=measured(),a=createAlbum(base);a.variants.manual.plan.walls[0].thickness=400;a.variants.manual.plan.furniture=[newFurniture('sofa',[500,500])];const before=JSON.stringify(a),next=withManualSheets(a,{measured:base,manual:manualPlanning()});
 assert.equal(JSON.stringify(a),before);const sheets=next.manualWorkspace.sheets.measured;assert.equal(sheets.length,3);assert.equal(new Set(sheets.map(s=>s.plan.id)).size,3);assert.equal(sheets[0].plan.walls[0].thickness,400);assert.equal(sheets[1].plan.walls[0].thickness,200);assert.equal(sheets[1].plan.furniture.length,0);assert.equal(base.plan.walls[0].thickness,200);
});
test('each mode has three independent sheets, stable IDs, isolated furniture and remembered selected sheet',()=>{
 const bases={measured:measured(),manual:manualPlanning()},source=JSON.stringify(bases);let a=withManualSheets(createAlbum(bases.measured),bases);const ids=[];
 for(const mode of ['measured','manual','archicad']){a=mode==='archicad'?importManualDxf(a,{...measured().plan,source:{...measured().plan.source,hash:'dxf-test'}}):switchManualSource(a,mode,bases);for(let i=0;i<3;i++){a=switchManualSheet(a,i);ids.push(a.variants.manual.plan.id);a=edit(a,p=>{p.furniture=[{...newFurniture('chair',[i*100,500]),name:mode+i}];});}}
 assert.equal(new Set(ids).size,9);assert.equal(JSON.stringify(bases),source);
 a=withManualSheets(JSON.parse(JSON.stringify(a)),bases);
 for(const mode of ['measured','manual','archicad']){a=switchManualSource(a,mode,bases);assert.equal(manualSheetIndex(a),2);for(let i=0;i<3;i++){a=switchManualSheet(a,i);assert.equal(a.variants.manual.plan.furniture[0].name,mode+i);assert.equal(a.variants.manual.plan.id,ids[['measured','manual','archicad'].indexOf(mode)*3+i]);}}
});
test('new import resets all three CAD sheets and archives every old sheet, leaving manual untouched',()=>{
 const bases={measured:measured(),manual:manualPlanning()};let a=withManualSheets(createAlbum(bases.manual),bases);a=edit(a,p=>p.furniture=[newFurniture('bed',[1,2])]);const manualId=a.variants.manual.plan.id;
 a=importManualDxf(a,measured().plan);for(let i=0;i<3;i++){a=switchManualSheet(a,i);a=edit(a,p=>p.furniture=[{...newFurniture('chair',[i,0]),name:'old-'+i}]);}const ids=a.manualWorkspace.sheets.archicad.map(s=>s.plan.id);a=importManualDxf(a,measured().plan);assert.equal(manualSheetIndex(a),0);assert.equal(a.manualWorkspace.sheets.archicad.length,3);assert.ok(a.manualWorkspace.sheets.archicad.every(s=>s.plan.furniture.length===0));for(const id of ids)assert.ok(a.manualWorkspace.history.some(h=>h.plan.id===id));a=switchManualSource(a,'manual',bases);assert.equal(a.variants.manual.plan.id,manualId);assert.equal(a.variants.manual.plan.furniture[0].kind,'bed');
});
test('invalid sheet index fails without changing the document',()=>{const a=createAlbum(measured()),before=JSON.stringify(a);for(const index of [-1,3,1.5,'1',null])assert.throws(()=>switchManualSheet(a,index));assert.equal(JSON.stringify(a),before);});
