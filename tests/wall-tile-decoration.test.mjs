import test from 'node:test';
import assert from 'node:assert/strict';
import {registerTileProduct} from '../room-design-planner/tile-products.mjs';
import {rotateTileDecor,replaceTileDecor} from '../room-design-planner/tile-decoration.mjs';
import {pieceBounds,pieceUV} from '../room-design-planner/wall-tile-pieces.mjs';
for(const [id,w,h] of [['rect',600,1200],['rect-other',600,1200],['square',900,900]])registerTileProduct({id:'test:'+id,widthMm:w,heightMm:h,image:'/test.jpg'});
const piece={id:'one',productId:'test:rect',angle:90,x:1,y:.3,joint:.002,grout:'#000000',side:1,clipBounds:[1,.4,2,1],grid:{groupId:'g'}};
test('rectangular decor has two turns with unchanged footprint, masks and origin',()=>{
 const changed=rotateTileDecor(piece);assert.equal(changed.angle,270);assert.deepEqual(pieceBounds(changed),pieceBounds(piece));assert.equal(rotateTileDecor(changed).angle,90);assert.deepEqual(changed.clipBounds,piece.clipBounds);assert.notDeepEqual(pieceUV(1.2,.5,changed),pieceUV(1.2,.5,piece));assert.equal(piece.angle,90);
});
test('square decor has four turns without moving its cell',()=>{let p={...piece,productId:'test:square',angle:0};const bounds=pieceBounds(p);for(let i=1;i<=4;i++){p=rotateTileDecor(p);assert.equal(p.angle,i*90%360);assert.deepEqual(pieceBounds(p),bounds);}});
test('single replacement preserves grid, grout and neighbouring pieces',()=>{const next=replaceTileDecor(piece,'test:rect-other');assert.deepEqual(next,{...piece,productId:'test:rect-other'});assert.equal(piece.productId,'test:rect');assert.throws(()=>replaceTileDecor(piece,'test:square'),/600 × 1200/);});
