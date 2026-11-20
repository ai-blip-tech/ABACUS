import test from 'node:test';
import assert from 'node:assert/strict';
import {shiftWallPattern,adjacentJointHeights,alignWallPattern,retainShiftedDecor} from '../room-design-planner/wall-pattern-phase.mjs';
import {fillRegion} from '../room-design-planner/tile-wall-fill.mjs';
import {registerTileProduct,pieceSize} from '../room-design-planner/tile-products.mjs';
const config={productId:'norrmobler:34339',angle:0,joint:.002,grout:'#aaaaaa'},bounds=[.06,0,3.14,2.8];
test('phase shifts both axes within fixed room-side bounds, never translating the region',()=>{
 const original=fillRegion(3.2,2.8,1,{...config,origin:[0,0]},[],bounds).pieces;
 const moved=shiftWallPattern(original,.13,.17);assert.equal(moved[0].x,original[0].x+.13);assert.equal(moved[0].y,original[0].y+.17);for(const p of moved){assert.deepEqual(p.clipBounds,bounds);assert.deepEqual(p.grid.region,bounds);assert.equal(p.grid.phaseDrag,true);}
 const regenerated=fillRegion(3.2,2.8,1,{...config,origin:moved[0].grid.origin},[],bounds).pieces;
 const pitch=pieceSize(original[0])[0]+config.joint;assert.ok(Math.abs(((regenerated[0].grid.origin[0]-original[0].grid.origin[0]-.13)%pitch+pitch)%pitch)<1e-6);assert.notDeepEqual(regenerated[0].grid.origin,original[0].grid.origin);
});
test('horizontal seam alignment uses the adjacent room face and snaps the pattern only',()=>{
 const p={...config,id:'p',side:1,x:.06,y:.1,clipBounds:bounds,grid:{origin:[.06,.1],region:bounds}};
 const neighbour={...p,y:.11},nodes={wall_b:{height:2.8,metadata:{roomDesignTiles:[neighbour,{...neighbour,side:-1,y:.9}]}}};
 const heights=adjacentJointHeights({adjacent:[{parts:[{wallId:'b',side:1,from:0,to:3200}]}]},nodes,'wall_a');assert.equal(heights.length,1);
 const aligned=alignWallPattern([p],heights,bounds);assert.ok(Math.abs(aligned.pieces[0].y-.11)<1e-6);assert.deepEqual(aligned.pieces[0].clipBounds,bounds);assert.equal(aligned.lines.length,1);assert.deepEqual(alignWallPattern([p],[2.2],bounds).pieces,[p]);
});
test('regenerating a shifted grid retains a replaced and rotated single decor',()=>{registerTileProduct({id:'test:variant',widthMm:150,heightMm:150,image:'/test.jpg'});const old={...config,x:.2,y:.3,productId:'test:variant',angle:270},next={...config,x:.2,y:.3,id:'new'};assert.equal(retainShiftedDecor([next],[old])[0].productId,'test:variant');assert.equal(retainShiftedDecor([next],[old])[0].angle,270);});
