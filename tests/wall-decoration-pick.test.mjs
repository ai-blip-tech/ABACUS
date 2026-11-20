import test from 'node:test';
import assert from 'node:assert/strict';
import {wallWorkPlaneHit} from '../room-design-planner/wall-work-pick.mjs';
const wall={thickness:.12,height:2.8},part={side:1,from:60,to:3140};
test('wall with a door remains selectable through the opening and next to it',()=>{
 assert.deepEqual(wallWorkPlaneHit([1.5,1,2],[0,0,-1],wall,part),[1.5,1,.06]);
 assert.deepEqual(wallWorkPlaneHit([.5,1,2],[0,0,-1],wall,part),[.5,1,.06]);
});
test('wall face picking respects the selected room interval and actual height',()=>{
 assert.equal(wallWorkPlaneHit([3.5,1,2],[0,0,-1],wall,part),null);
 assert.equal(wallWorkPlaneHit([1.5,3,2],[0,0,-1],wall,part),null);
 assert.equal(wallWorkPlaneHit([1.5,-.1,2],[0,0,-1],wall,part),null);
});
test('the reverse wall face has its own plane; parallel and backward rays are rejected',()=>{
 assert.deepEqual(wallWorkPlaneHit([1.5,1,-2],[0,0,1],wall,{...part,side:-1}),[1.5,1,-.06]);
 assert.equal(wallWorkPlaneHit([1.5,1,2],[1,0,0],wall,part),null);
 assert.equal(wallWorkPlaneHit([1.5,1,2],[0,0,1],wall,part),null);
});
