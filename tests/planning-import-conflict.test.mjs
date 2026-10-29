import test from 'node:test';
import assert from 'node:assert/strict';
import {PlanningSaveQueue} from '../lib/planning-plan/save-queue.ts';
test('explicit import reads current revision after queued writes; ordinary stale saves stay blocked',async()=>{
 const calls=[];let fail=true;const q=new PlanningSaveQueue(1,async b=>{calls.push(b);return fail?{ok:false,status:409,error:'conflict',revision:5,document:{}}:{ok:true,status:200,revision:b.revision+1,document:{imported:true}};});
 await assert.rejects(q.request('workspace-save'));await assert.rejects(q.request('workspace-save'));assert.equal(calls.length,1);
 fail=false;const result=await q.importLatest({confirmed:true,text:'source'},async()=>5,()=>false);assert.equal(result.revision,6);assert.equal(calls[1].action,'workspace-import-dxf');assert.equal(calls[1].revision,5);
 await q.request('workspace-save');assert.equal(calls[2].revision,6);
});
test('unsaved changes block import before and after loading current version',async()=>{
 let sends=0,loads=0;const q=new PlanningSaveQueue(1,async()=>{sends++;throw Error('must not write');});
 await assert.rejects(q.importLatest({},async()=>{loads++;return 5;},()=>true),/несохранённые/);assert.equal(loads,0);
 let dirty=false;await assert.rejects(q.importLatest({},async()=>{dirty=true;return 5;},()=>dirty),/План изменился/);assert.equal(sends,0);
});
test('a concurrent write during import is still rejected, not force-overwritten or silently retried',async()=>{
 let sends=0;const q=new PlanningSaveQueue(1,async()=>{sends++;return{ok:false,status:409,error:'concurrent change',revision:8,document:{}};});
 await assert.rejects(q.importLatest({},async()=>7,()=>false),/concurrent change/);assert.equal(sends,1);await assert.rejects(q.request('workspace-save'));assert.equal(sends,1);
});
test('revision fetch failure never writes',async()=>{let sends=0;const q=new PlanningSaveQueue(1,async()=>{sends++;throw Error('unexpected');});await assert.rejects(q.importLatest({},async()=>{throw Error('offline');},()=>false),/offline/);assert.equal(sends,0);});
