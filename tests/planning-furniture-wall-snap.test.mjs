import test from 'node:test';
import assert from 'node:assert/strict';
import {snapFurnitureToWalls,furnitureWallContacts} from '../lib/planning-plan/furniture-wall-snap.ts';
import {newFurniture} from '../lib/planning-plan/furniture.ts';
const wall=(a,b,thickness=200)=>({id:a.join()+b.join(),a,b,thickness});
const horizontal=wall([-3000,0],[3000,0]);
const item=()=>({...newFurniture('table',[0,600]),width:800,depth:600});
const near=(a,b)=>assert.ok(Math.abs(a-b)<.001,`${a} != ${b}`);
test('snaps item edge to wall face accounting for thickness on either side',()=>{
 const f=item(),before=structuredClone(f);near(snapFurnitureToWalls(f,[0,600],[100,440],[horizontal])[1],400);near(snapFurnitureToWalls(f,[0,-600],[100,-440],[horizontal])[1],-400);assert.deepEqual(f,before);
});
test('fast crossing reaches the pointer position on the far side',()=>{assert.deepEqual(snapFurnitureToWalls(item(),[0,600],[1000,-1500],[horizontal]),[1000,-1500]);});
test('touching item can move into, through and away from a wall',()=>{near(snapFurnitureToWalls(item(),[0,400],[900,300],[horizontal])[1],300);near(snapFurnitureToWalls(item(),[0,400],[0,800],[horizontal])[1],800);});
test('rotated item can cross walls without changing its footprint',()=>{const f={...item(),rotation:45};assert.deepEqual(snapFurnitureToWalls(f,[0,900],[0,100],[horizontal]),[0,100]);});
test('interior corner does not trap furniture',()=>{const walls=[horizontal,wall([0,-3000],[0,3000])];assert.deepEqual(snapFurnitureToWalls(item(),[800,800],[100,100],walls),[100,100]);});
test('finite segments do not create phantom walls and real gaps remain passable',()=>{near(snapFurnitureToWalls(item(),[4000,600],[4000,-600],[horizontal])[1],-600);const walls=[wall([-3000,0],[-600,0]),wall([600,0],[3000,0])];near(snapFurnitureToWalls(item(),[0,600],[0,-600],walls)[1],-600);});
test('existing overlap can be dragged out and Alt disables the magnet',()=>{near(snapFurnitureToWalls(item(),[0,200],[0,800],[horizontal])[1],800);near(snapFurnitureToWalls(item(),[0,600],[0,440],[horizontal],0)[1],440);near(snapFurnitureToWalls(item(),[0,600],[0,-900],[horizontal],0)[1],-900);});
test('free motion and degenerate walls leave requested position unchanged',()=>{assert.deepEqual(snapFurnitureToWalls(item(),[0,600],[123,987],[]),[123,987]);assert.deepEqual(snapFurnitureToWalls(item(),[0,600],[123,987],[wall([0,0],[0,0])]),[123,987]);});

test('contact guide matches only a flush edge and the finite wall segment',()=>{const f={...item(),position:[100,400]};const contacts=furnitureWallContacts(f,[horizontal]);assert.equal(contacts.length,1);assert.deepEqual(contacts[0].a,[-300,100]);assert.deepEqual(contacts[0].b,[500,100]);assert.equal(furnitureWallContacts({...f,position:[100,410]},[horizontal]).length,0);assert.equal(furnitureWallContacts({...f,position:[100,200]},[horizontal]).length,0);assert.equal(furnitureWallContacts({...f,position:[4000,400]},[horizontal]).length,0);});
