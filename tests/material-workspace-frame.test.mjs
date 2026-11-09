import {test} from 'node:test';
import assert from 'node:assert/strict';
import {frameWorkspace} from '../lib/material-board/frame-workspace.ts';
for(const count of [1,3,10,100])test(`all ${count} cards and the furniture launcher fit inside the viewport`,()=>{
 const items=[{x:-280,y:120,width:235,height:300},...Array.from({length:count},(_,i)=>({x:i*320+40,y:110+(i%2)*180,width:280,height:280}))];
 const v=frameWorkspace(items,907,600);
 assert.ok(v.scale>0&&v.scale<=1);
 for(const n of items){assert.ok(n.x*v.scale+v.x>=0);assert.ok(n.y*v.scale+v.y>=0);assert.ok((n.x+n.width)*v.scale+v.x<=907+.001);assert.ok((n.y+n.height)*v.scale+v.y<=600+.001);}
});
