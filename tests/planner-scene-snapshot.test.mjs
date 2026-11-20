import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotScene} from '../room-design-planner/scene-snapshot.mjs';
for(const legacy of [false,true])test(`snapshot preserves region materials (${legacy?'array':'record'})`,()=>{
 const region={productId:'a',displacedTiles:[{productId:'b'}]};
 const state={nodes:{wall:{type:'wall',metadata:{roomDesignTileRegions:legacy?[region]:{r:region}}}},rootNodeIds:['wall']};
 const original=JSON.stringify(state),products=[{id:'a'},{id:'b'},{id:'unused'}];
 const result=snapshotScene(state,products);
 assert.deepEqual(result.nodes.wall.metadata.roomDesignTileProducts,[{id:'a'},{id:'b'}]);
 assert.equal(JSON.stringify(state),original);
 result.nodes.wall.metadata.roomDesignTileProducts[0].id='changed';assert.equal(products[0].id,'a');
});
test('snapshot retains direct tiles and settings',()=>{
 const state={nodes:{wall:{type:'wall',metadata:{roomDesignTiles:[{productId:'a'}],roomDesignTileSettings:{productId:'b'}}}},rootNodeIds:[]};
 assert.equal(snapshotScene(state,[{id:'a'},{id:'b'}]).nodes.wall.metadata.roomDesignTileProducts.length,2);
});
