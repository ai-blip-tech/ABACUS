import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard,worldPoint,zoomAt,connectNodes,removeNodes,moveNodes,duplicateNodes,fitBoard,findOverlappingNode,isMaterialTransferTarget,isBoard} from '../lib/material-board/model.ts';
import {emptyInterior,rectangleBetween,bindReferenceToPlanItem,detachReferenceFromPlanItem} from '../lib/material-board/interior-workspace.ts';
const node=(id,x=0)=>({id,kind:'material',x,y:10,width:220,height:240,title:id});
test('material workspace starts empty and validates stored board',()=>{assert.deepEqual(emptyBoard(),{version:1,nodes:[],links:[],groups:[]});assert.ok(isBoard(emptyBoard()));assert.equal(isBoard({version:1,nodes:[],links:null,groups:[]}),false);assert.equal(isBoard({...emptyBoard(),nodes:[{...node('a'),image:'javascript:alert(1)'}]}),false);assert.ok(isBoard({...emptyBoard(),nodes:[{...node('a'),image:'/api/projects/123e4567-e89b-12d3-a456-426614174000/assets/material-abc'}]}));assert.equal(isBoard({...emptyBoard(),nodes:[{...node('a'),image:'/api/projects/bad/path'}]}),false);});

test('an interior work area is drawn in any direction and persists as part of its sheet',()=>{
 assert.deepEqual(rectangleBetween({x:900,y:700},{x:200,y:100}),{x:200,y:100,width:700,height:600});
 const interior=emptyInterior(700,600);
 const board={...emptyBoard(),nodes:[{...node('interior'),x:200,y:100,width:700,height:600,title:'Создание интерьера',interior}]};
 assert.equal(interior.room.width,7000);
 assert.equal(interior.room.length,6000);
 assert.equal(isBoard(JSON.parse(JSON.stringify(board))),true);
 assert.equal(isBoard({...board,nodes:[{...board.nodes[0],interior:{...interior,room:{width:0,length:6000}}}]}),false);
});
test('a sandbox product can replace a concrete plan item without changing its position',()=>{
 const base={...emptyInterior(700,600),items:[{id:'chair-1',kind:'chair',name:'Кресло',x:20,y:30,width:800,depth:800,rotation:15}]};
 const next=bindReferenceToPlanItem(base,'chair-1',{title:'Кресло RICO',image:'data:image/png;base64,AAAA',catalogId:'rico',brand:'NORR',widthMm:920,depthMm:870,heightMm:760});
 assert.equal(next.items[0].name,'Кресло RICO');
 assert.equal(next.items[0].referenceProductId,'rico');
 assert.equal(next.items[0].referenceImage,'data:image/png;base64,AAAA');
 assert.deepEqual(next.items[0].referenceBase,{name:'Кресло',width:800,depth:800});
 assert.deepEqual({x:next.items[0].x,y:next.items[0].y,rotation:next.items[0].rotation},{x:20,y:30,rotation:15});
});
test('the first delete detaches a product and restores the original plan item',()=>{
 const attached={id:'chair-1',kind:'chair',name:'Кресло RICO',x:20,y:30,width:920,depth:870,rotation:15,referenceBase:{name:'Кресло',width:800,depth:800},referenceImage:'image',referenceImages:['image'],referenceName:'Кресло RICO',referenceProductId:'rico',referenceBrand:'NORR'};
 const detached=detachReferenceFromPlanItem(attached);
 assert.deepEqual({name:detached.name,width:detached.width,depth:detached.depth},{name:'Кресло',width:800,depth:800});
 assert.equal(detached.referenceImage,undefined);
 assert.equal(detached.referenceProductId,undefined);
 assert.equal(detached.referenceBase,undefined);
});
test('zoom keeps the pointer anchored in world coordinates and clamps range',()=>{const v={x:75,y:-30,scale:.75},p={x:200,y:100};assert.deepEqual(worldPoint(p,zoomAt(v,p,1.5)),worldPoint(p,v));assert.equal(zoomAt(v,p,20).scale,2.5);assert.equal(zoomAt(v,p,.01).scale,.25);});
test('connections reject self, missing and duplicate links',()=>{let b={...emptyBoard(),nodes:[node('a'),node('b',300)]};b=connectNodes(b,'a','b','one');assert.equal(b.links.length,1);assert.equal(connectNodes(b,'b','a','two'),b);assert.equal(connectNodes(b,'a','a','three'),b);assert.equal(connectNodes(b,'a','missing','four'),b);});
test('removal cleans links, room groups and assigned materials',()=>{const b={...emptyBoard(),nodes:[node('a'),{...node('b',300),kind:'product',materialId:'a'}],links:[{id:'l',from:'a',to:'b'}],groups:[{id:'g',title:'Спальня',members:['a','b']}]};const next=removeNodes(b,['a']);assert.equal(next.links.length,0);assert.equal(next.groups.length,0);assert.equal(next.nodes[0].materialId,undefined);assert.equal(b.nodes.length,2);});
test('group moving preserves relative geometry; duplicates get fresh identities',()=>{const b={...emptyBoard(),nodes:[node('a'),node('b',300)],links:[{id:'l',from:'a',to:'b'}]};const moved=moveNodes(b,['a','b'],50,-20);assert.equal(moved.nodes[1].x-moved.nodes[0].x,300);let n=0;const copy=duplicateNodes(moved,['a','b'],()=>String(++n));assert.equal(copy.board.nodes.length,4);assert.equal(copy.board.links.length,2);assert.ok(copy.board.links.at(-1).from!==b.links[0].from);assert.ok(isBoard(copy.board));});
test('fit can return a far-away table into the viewport',()=>{const nodes=[node('a',100000),node('b',100300)],v=fitBoard(nodes,1200,700);for(const n of nodes){assert.ok(n.x*v.scale+v.x>=0);assert.ok((n.x+n.width)*v.scale+v.x<=1200);}assert.deepEqual(fitBoard([],1200,700),{x:0,y:0,scale:1});});
test('a material card can target a product by visible overlap even when the pointer is outside the product',()=>{
 const source={...node('red'),x:100,y:100,width:100,height:100},overlapped={...node('chair'),kind:'product',x:180,y:180,width:100,height:100},far={...node('sofa'),kind:'product',x:400,y:400,width:100,height:100};
 assert.equal(findOverlappingNode(source,[far,overlapped],{x:150,y:150})?.id,'chair');
 assert.equal(findOverlappingNode(source,[far],{x:150,y:150}),undefined);
});
test('material transfer accepts furniture images from the catalog, Reference and the legacy furniture uploader',()=>{
 assert.equal(isMaterialTransferTarget({...node('legacy'),kind:'product',image:'data:image/png;base64,AAAA'}),true);
 assert.equal(isMaterialTransferTarget({...node('catalog-reference'),kind:'reference',catalogId:'chair',image:'data:image/png;base64,AAAA'}),true);
 assert.equal(isMaterialTransferTarget({...node('uploaded-reference'),kind:'reference',image:'data:image/png;base64,AAAA'}),true);
 assert.equal(isMaterialTransferTarget({...node('scene'),kind:'reference',scene:true,image:'data:image/png;base64,AAAA'}),false);
 assert.equal(isMaterialTransferTarget({...node('tray'),kind:'reference',trayOnly:true,image:'data:image/png;base64,AAAA'}),false);
});
