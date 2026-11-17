import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyBoard} from '../lib/material-board/model.ts';
import {asWorkbook,appendSheet,activeSheet} from '../lib/material-board/workbook.ts';
import {resolveWorkbookDraft} from '../lib/material-board/workbook-draft.ts';
import {plannerRenderTray,withPlannerRenderTray} from '../lib/material-board/planner-render-tray.ts';
const id='ae1fdcd2-f895-4d8f-98fd-3afa9e78bce1',project='project-one';
const row={id,status:'ready',image:'/api/projects/'+project+'/assets/visual-render-'+id,created_at:'2026-11-17T20:00:00.000Z'};
test('a server camera render is visible over an unsaved browser draft on either sheet without overwriting the draft',()=>{
 const local={kind:'workbook-draft',revision:1,dirty:true,workbook:appendSheet(asWorkbook({...emptyBoard(),nodes:[{id:'note',kind:'note',title:'Мой черновик',text:'Не терять',x:0,y:0,width:180,height:180}]}),'second')};
 const before=structuredClone(local),remote=asWorkbook(emptyBoard()),resolved=resolveWorkbookDraft(local,remote,2),renders=plannerRenderTray({items:[row]},project);
 for(const sheet of resolved.workbook.sheets){const tray=withPlannerRenderTray(sheet.board.nodes,renders.nodes);assert.equal(tray[0].id,'planner-render-'+id);assert.equal(tray[0].image,row.image);}
 assert.deepEqual(local,before);assert.equal(resolved.revision,1);assert.equal(activeSheet(resolved.workbook).id,'second');
});
test('existing camera references deduplicate and keep the placed geometry; newest ready result comes first',()=>{
 const old=plannerRenderTray({items:[row]},project).nodes[0],placed={...old,x:350,y:250,trayOnly:false};
 const newer={...row,id:'be1fdcd2-f895-4d8f-98fd-3afa9e78bce2',created_at:'2026-11-17T21:00:00.000Z'};
 const results=plannerRenderTray({items:[newer,row]},project),tray=withPlannerRenderTray([placed],results.nodes);
 assert.equal(tray.length,2);assert.equal(tray[1],placed);assert.equal(tray[1].x,350);assert.equal(tray[0].trayOrder,Date.parse(newer.created_at));
});
test('failed, pending and cross-project images never appear; trash hides stale references too',()=>{
 const payload={items:[{...row,status:'error'},{...row,status:'rendering'},{...row,image:'/api/projects/another/assets/visual-render-'+id},{...row,image:'/api/projects/'+project+'/assets/visual-render-../other'}],trash:[{id}]};
 const results=plannerRenderTray(payload,project);assert.equal(results.nodes.length,0);
 const existing=plannerRenderTray({items:[row]},project).nodes;
 assert.equal(withPlannerRenderTray(existing,[],results.hidden).length,0);
});
