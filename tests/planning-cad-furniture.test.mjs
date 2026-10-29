import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDxf,convertDxf,defaultDxfRoles} from '../lib/planning-plan/dxf-import.ts';
import {cadWorldPaths} from '../lib/planning-plan/dxf-furniture.ts';
import {confirmFurnitureType,needsFurnitureTypeReview,furnitureTypeChoices} from '../lib/planning-plan/furniture-type-review.ts';
import {dxfFurnitureKind} from '../lib/planning-plan/dxf-furniture-type.ts';
import {validateFurniture} from '../lib/planning-plan/furniture.ts';
import {furnitureCatalogType} from '../lib/planning-plan/furniture-sidebar.ts';
import {dxf,block,insert,line,poly,record} from './dxf-fixture.mjs';
const importScene=text=>{const s=parseDxf(text);return{s,p:convertDxf(s,{unit:'mm',roles:defaultDxfRoles(s),axisThickness:100},'test.dxf')};};
const hatch=points=>record('HATCH',[[8,'0'],[2,'SOLID'],[70,1],[91,1],[92,3],[72,0],[73,1],[93,points.length],...points.flatMap(p=>[[10,p[0]],[20,p[1]]]),[97,0]]);
test('explicit plausible sofa is automatic; unknown, contradictory or implausible CAD items stay red',()=>{
 const {p}=importScene(dxf(insert('Диван 27'),{blocks:block('Диван 27',poly([[0,0],[2200,0],[2200,950],[0,950]]))}));const f=p.plan.furniture[0];assert.equal(needsFurnitureTypeReview(f),false);
 assert.equal(needsFurnitureTypeReview({...f,width:100,depth:100}),true);
 assert.equal(needsFurnitureTypeReview({...f,cad:{...f.cad,blockName:'Кровать стол'}}),true);
 assert.equal(dxfFurnitureKind('Кровать стол'),null);assert.equal(dxfFurnitureKind('Кухонная мойка'),'sink');
 assert.equal(dxfFurnitureKind('TV stand'), 'tv_stand');assert.equal(dxfFurnitureKind('Мойка'), 'sink');assert.equal(dxfFurnitureKind('Секция 27'),null);
});
test('context taxonomy includes coffee tables, kitchen and plumbing; manual choice overrides misleading name',()=>{
 for(const id of ['coffee_table','dining_table','dresser','tv_stand','kitchen','fridge','bath','shower','toilet','sink'])assert.ok(furnitureTypeChoices.some(c=>c.id===id),id);
 const {p}=importScene(dxf(insert('Стол обеденный'),{blocks:block('Стол обеденный',poly([[0,0],[1200,0],[1200,600],[0,600]]))}));const f=p.plan.furniture[0],choice=furnitureTypeChoices.find(c=>c.id==='coffee_table'),next={...f,...confirmFurnitureType(f,choice.kind,choice.catalogType)};
 assert.equal(furnitureCatalogType(next),'coffee_table');assert.equal(needsFurnitureTypeReview(next),false);assert.deepEqual(next.cad.paths,f.cad.paths);
 const dresser={...next,...confirmFurnitureType(next,'dresser','dresser')};assert.equal(furnitureCatalogType(dresser),'dresser');assert.deepEqual(dresser.cad.paths,f.cad.paths);
});
test('detailed CAD symbol preserves every original point, reflection, dimensions and rotation',()=>{
 const {s,p}=importScene(dxf(insert('Кровать с подушками',5000,3000,[[41,-1.2],[42,.7],[50,37]]),{blocks:block('Кровать с подушками',[...poly([[0,0],[1800,0],[1800,2100],[0,2100]]),...poly([[100,100],[800,100],[800,400],[100,400]]),...line([0,700],[1800,800],'0')])}));
 const f=p.plan.furniture[0];assert.equal(f.kind,'bed');assert.equal(f.cad.paths.length,3);const world=cadWorldPaths(f);for(let i=0;i<world.length;i++)for(let j=0;j<world[i].points.length;j++){const source=s.paths[i].points[j],wanted=[source[0]-p.origin[0],p.origin[1]-source[1]],actual=world[i].points[j];assert.ok(Math.hypot(actual[0]-wanted[0],actual[1]-wanted[1])<1e-8);}assert.deepEqual(validateFurniture(JSON.parse(JSON.stringify([f])))[0].cad,f.cad);
});
test('exploded fill and separate bedding lines become one unknown object, not lost lines or a box',()=>{const points=[[0,0],[1800,0],[1800,2100],[0,2100]],{p}=importScene(dxf([...hatch(points),...line([0,0],[1800,0],'0'),...line([0,300],[1800,300],'0'),...line([100,100],[800,100],'0')]));assert.equal(p.plan.furniture.length,1);assert.equal(p.plan.furniture[0].cad.paths.length,4);assert.equal(p.plan.furniture[0].cad.classification,'unknown');assert.ok(needsFurnitureTypeReview(p.plan.furniture[0]));});
test('context confirmation clears red state and selects bed catalog without changing vectors',()=>{const {p}=importScene(dxf(insert('Неизвестный блок'),{blocks:block('Неизвестный блок',poly([[0,0],[1800,0],[1800,2100],[0,2100]]))})),old=p.plan.furniture[0],next={...old,...confirmFurnitureType(old,'bed')};assert.ok(needsFurnitureTypeReview(old));assert.equal(needsFurnitureTypeReview(next),false);assert.equal(furnitureCatalogType(next),'bed');assert.deepEqual(old.cad.paths,next.cad.paths);assert.deepEqual(old.position,next.position);const renamed={...next,name:'Предмет 1'};assert.equal(furnitureCatalogType(renamed),'bed');});
test('unsafe vectors, HTML colors, unbounded coordinates and unsupported versions are rejected',()=>{const {p}=importScene(dxf(insert('Кровать'),{blocks:block('Кровать',poly([[0,0],[1800,0],[1800,2100],[0,2100]]))}));for(const mutate of [c=>c.version=9,c=>c.paths[0].points[0][0]=Infinity,c=>c.paths[0].fill='url(javascript:alert(1))']){const f=structuredClone(p.plan.furniture[0]);mutate(f.cad);assert.throws(()=>validateFurniture([f]));}});
test('type question is in context menu, not right sidebar, and vector renderer/print paths are used',()=>{const read=p=>readFileSync(new URL(p,import.meta.url),'utf8'),menu=read('../app/planning-plan/furniture-context-menu.tsx'),editor=read('../app/planning-plan/furniture-editor.tsx');assert.match(menu,/Что это за предмет\?/);assert.match(menu,/confirmFurnitureType/);assert.match(menu,/needsFurnitureTypeReview/);assert.doesNotMatch(editor,/Тип предмета CAD/);assert.match(editor,/data-cad-symbol/);assert.match(editor,/cad=\{f.cad\}/);assert.match(read('../lib/planning-plan/print.ts'),/cadWorldPaths\(f\)/);});
