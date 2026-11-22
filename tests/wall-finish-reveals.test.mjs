import test from 'node:test';
import assert from 'node:assert/strict';
import {clippedRevealTriangles,paintedWallTriangles,windowRevealProjections} from '../room-design-planner/wall-finish-geometry.mjs';

test('all four window reveals can receive different finishes on the two wall faces',()=>{
 const window={bounds:[1,1,2,2],frameZ:.02};
 const points=[];
 for(const axis of [0,1])for(const edge of [1,2]){
  const point=(along,z)=>axis===0?[edge,along,z]:[along,edge,z];
  const [a,b,c,d]=[point(1,-.2),point(2,-.2),point(2,.2),point(1,.2)];
  points.push(...a,...b,...c,...a,...c,...d);
 }
 points.push(0,0,.2,1,0,.2,1,1,.2);
 const {skip,faces}=windowRevealProjections(points,null,[window],[3,3],[-.2,.2]);
 assert.equal(skip.size,8);
 assert.equal(faces.length,8);
 assert.deepEqual(paintedWallTriangles(points,null,{side:1,bounds:[0,0,3,3]},3,3,[],skip).length,9);
 for(const face of faces){
  const bounds=[0,0,3,3];
  const across=1-face.axis;
  bounds[across]=1.3;bounds[across+2]=1.7;
  const clipped=clippedRevealTriangles(face,[bounds]);
  assert.ok(clipped.length>0);
  for(let i=0;i<clipped.length;i+=3){
   assert.ok(clipped[i+across]>=1.3-1e-8&&clipped[i+across]<=1.7+1e-8);
   assert.ok((clipped[i+face.axis]-face.edge)*face.direction>=-1e-8);
  }
 }
});
