import test from 'node:test';
import assert from 'node:assert/strict';
import {findWalkStart} from '../room-design-planner/walkthrough-math.mjs';
import {detectedRooms} from '../lib/measured-plan/measure-rooms.ts';
import {blankDoc} from '../lib/measured-plan/measure-model.ts';
import {wallInView,wallSurfaceAt,wallSurfaces,selectedWallQueue,wallWorkContext} from '../lib/wall-decoration/surfaces.ts';
import {setRoomFinishSurface,setWallWork,workBounds,clampWorkBounds} from '../room-design-planner/wall-work-scope.mjs';
function plan(points){const d=blankDoc({name:'test',mime:'',hash:'',width:1,height:1,page:1,pages:1,method:'manual',image:'',words:[],pixelScale:1});d.floor=points;d.height=2800;d.walls=points.map((a,i)=>({id:'w'+i,name:'Стена '+i,a,b:points[(i+1)%points.length],thickness:100,height:2800,group:'outer',lengthConfirmed:true,thicknessConfirmed:true,provenance:'test'}));return d;}
test('rectangular and L-shaped rooms expose four and six real faces',()=>{for(const [points,count] of [[[[0,0],[6000,0],[6000,4000],[0,4000]],4],[[[0,0],[6000,0],[6000,2000],[3000,2000],[3000,4000],[0,4000]],6]]){const d=plan(points),surfaces=wallSurfaces(d);assert.equal(surfaces.length,count);assert.ok(surfaces.every(s=>s.parts.length&&s.heightMm===2800));for(const s of surfaces){assert.ok(Math.hypot(...s.normal)>.999);assert.equal(wallWorkContext(s,surfaces).adjacent.length,2);}}});
test('two collinear source walls and two windows remain one elevation',()=>{const d=plan([[0,0],[6000,0],[6000,4000],[0,4000]]);d.walls.splice(0,1,{...d.walls[0],b:[3000,0]},{...d.walls[0],id:'w0b',a:[3000,0]});d.openings=[{id:'o1',wallId:'w0',kind:'window',offset:1500,width:1000,height:1400,sill:900,confirmed:true},{id:'o2',wallId:'w0b',kind:'window',offset:1500,width:1000,height:1400,sill:900,confirmed:true}];const s=wallSurfaces(d);assert.equal(s.length,4);assert.equal(s.find(s=>s.parts.length===2).parts.length,2);assert.equal(d.openings.length,2);});
test('opposite room sides are independent and long walls are bounded by the room',()=>{const d=plan([[0,0],[6000,0],[6000,4000],[0,4000]]);d.walls.push({...d.walls[0],id:'partition',a:[3000,0],b:[3000,4000],group:'partition'});const surfaces=wallSurfaces(d),sides=surfaces.flatMap(s=>s.parts.filter(p=>p.wallId==='partition'));assert.equal(sides.length,2);assert.deepEqual(new Set(sides.map(p=>p.side)),new Set([1,-1]));const tops=surfaces.flatMap(s=>s.parts.filter(p=>p.wallId==='w0'));assert.equal(tops.length,2);assert.ok(tops.every(p=>p.to-p.from<3000));});
test('manual queue starts at first selected face; physical neighbours include unselected walls',()=>{const surfaces=wallSurfaces(plan([[0,0],[6000,0],[6000,4000],[0,4000]]));const chosen=[surfaces[2].id,surfaces[0].id];const queue=selectedWallQueue(surfaces,chosen);assert.deepEqual(queue.map(s=>s.id),chosen);const c=wallWorkContext(queue[0],surfaces);assert.equal(c.adjacent.length,2);assert.ok(c.adjacent.every(s=>!chosen.includes(s.id)));});
test('room scope clamps drawing bounds and rejects the reverse face',()=>{const wall={id:'wall_shared',start:[0,0],end:[8,0],height:2.8};setWallWork({surface:{parts:[{wallId:'shared',side:1,from:1000,to:3000}]}});assert.deepEqual(workBounds(wall,1),[1,0,3,2.8]);assert.equal(workBounds(wall,-1),null);assert.deepEqual(clampWorkBounds(wall,1,[0,0,6,2]),[1,0,3,2]);setWallWork(null);assert.deepEqual(workBounds(wall,-1),[0,0,8,2.8]);});

test('walking edits a long structural wall only up to the partition on the current room face',()=>{
 const d=plan([[0,0],[6000,0],[6000,4000],[0,4000]]);
 d.walls.push({...d.walls[0],id:'partition',a:[2200,0],b:[2200,4000],group:'inner'});
 const surfaces=wallSurfaces(d),wall={id:'wall_w0',start:[0,0],end:[6,0],height:2.8};
 const left=wallSurfaceAt(surfaces,'w0',1,1200,[1200,50]);
 const right=wallSurfaceAt(surfaces,'w0',1,4000,[4000,50]);
 assert.ok(left&&right&&left.roomId!==right.roomId);
 try {
  setRoomFinishSurface(left);
  assert.deepEqual(clampWorkBounds(wall,1,[0,0,6,2.8]),[.05,0,2.15,2.8]);
  assert.equal(workBounds(wall,-1),null);
  setRoomFinishSurface(right);
  assert.deepEqual(workBounds(wall,1),[2.25,0,5.95,2.8]);
 } finally {
  setRoomFinishSurface(null);
 }
 assert.deepEqual(d.walls[0].b,[6000,0]);
});

test('minimap follows the current position and sightline, including a view through a doorway',()=>{
 const d=plan([[0,0],[6000,0],[6000,4000],[0,4000]]);
 d.walls.push({...d.walls[0],id:'partition',a:[2200,0],b:[2200,4000],group:'inner'});
 d.openings.push({id:'door',wallId:'partition',kind:'door',offset:2000,width:900,height:2100,sill:0,confirmed:true});
 const surfaces=wallSurfaces(d),pose={position:[1200,2000],direction:[0,-1],height:1600,slope:0};
 const left=wallInView(d,surfaces,pose),right=wallInView(d,surfaces,{...pose,position:[4200,2000]});
 assert.ok(left&&right&&left.surface.roomId!==right.surface.roomId);
 assert.deepEqual(left.point,[1200,50]);
 assert.deepEqual(right.point,[4200,50]);
 const across=wallInView(d,surfaces,{...pose,direction:[1,0]});
 assert.deepEqual(across.point,[5950,2000]);
 assert.equal(wallInView(d,surfaces,{...pose,slope:-20}),null);
});

test('walk starts at the same point when possible and stays in the selected room when the wall view is outside it',()=>{
 const d=plan([[0,0],[6000,0],[6000,4000],[0,4000]]);
 d.walls.push({...d.walls[0],id:'partition',a:[2200,0],b:[2200,4000],group:'inner'});
 const room=detectedRooms(d).find(item=>item.anchor[0]<2200);
 const insideRoom=[1.25,2.35];
 assert.equal(findWalkStart(d,insideRoom,room),insideRoom);
 const start=findWalkStart(d,[4.2,2.35],room);
 assert.ok(start[0]<2&&start[0]>1.8);
 assert.ok(Math.abs(start[1]-2.35)<.075);
});
