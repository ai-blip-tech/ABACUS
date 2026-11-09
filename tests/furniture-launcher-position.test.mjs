import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,moveNodes,isBoard} from '../lib/material-board/model.ts';
test('moving a card under the launcher never changes its saved position',()=>{
 const board={...emptyBoard(),furniturePosition:{x:75,y:140},nodes:[{id:'chair',kind:'product',title:'Chair',x:500,y:140,width:280,height:280}]};
 const moved=moveNodes(board,['chair'],-425,0);
 assert.deepEqual(moved.furniturePosition,{x:75,y:140});
 assert.equal(moved.nodes[0].x,75);
 assert.equal(isBoard(JSON.parse(JSON.stringify(moved))),true);
});
test('launcher position is optional for old boards and rejects malformed coordinates',()=>{
 assert.equal(isBoard(emptyBoard()),true);
 assert.equal(isBoard({...emptyBoard(),furniturePosition:null}),false);
 assert.equal(isBoard({...emptyBoard(),furniturePosition:{x:NaN,y:10}}),false);
});
