import assert from 'node:assert/strict';
import test from 'node:test';
import {blankDoc} from '../lib/measured-plan/measure-model.ts';
import {furniturePositionInView} from '../lib/planning-plan/furniture-view-placement.ts';

const dresser={kind:'dresser',width:1200,depth:450,rotation:0};
function plan(){
 const doc=blankDoc({name:'',image:'',words:[],method:'manual'});
 doc.height=2800;
 doc.floor=[[0,0],[6000,0],[6000,4000],[0,4000]];
 doc.walls=doc.floor.map((a,index)=>({id:'outer'+index,a,b:doc.floor[(index+1)%4],thickness:100,group:'outer'}));
 doc.walls.push({id:'partition',a:[2900,0],b:[2900,4000],thickness:100,group:'inner'});
 doc.openings=[{id:'opening',wallId:'partition',kind:'opening',offset:1800,width:1200,sill:0}];
 return doc;
}

test('walkthrough placement stays this side of a partition when the gaze crosses its doorway',()=>{
 const position=furniturePositionInView(plan(),{mode:'eye',position:[1.4,1.6,1.8],direction:[1,-.2,0]},dresser);
 assert.deepEqual(position,[2245,1800]);
});

test('the orbit camera chooses the room under the centre of the view',()=>{
 const position=furniturePositionInView(plan(),{mode:'3d',position:[2,5,2],direction:[.4,-1,0]},dresser);
 assert.deepEqual(position,[4000,2000]);
});

test('a footprint that fits only in the next room is rejected',()=>{
 assert.throws(()=>furniturePositionInView(plan(),{mode:'eye',position:[1.4,1.6,1.8],direction:[1,0,0]},
  {...dresser,width:2950}),/Перед камерой нет места/);
});

test('a second piece uses nearby free floor, with clearance from the camera',()=>{
 const doc=plan();
 doc.furniture=[{...dresser,position:[2245,1800]}];
 const position=furniturePositionInView(doc,{mode:'eye',position:[1.4,1.6,1.8],direction:[1,0,0]},dresser);
 assert.ok(position[0]>1400&&position[0]<=2245);
 assert.ok(Math.abs(position[1]-1800)>=455);
});
