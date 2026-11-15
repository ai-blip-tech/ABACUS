import type {DatabaseSync} from 'node:sqlite';
import type {AppUser} from '../auth.ts';
import {emptyBoard, type MaterialNode} from './model.ts';
import {activeSheet, appendSheet, asWorkbook, withActiveBoard} from './workbook.ts';

export function addPlannerRender(
 db:DatabaseSync, user:AppUser, projectId:string, renderId:string, image:string, portrait:boolean,
){
 const row=db.prepare('SELECT document_json,revision FROM material_boards WHERE project_id=? AND user_id=? AND tenant_id=?')
  .get(projectId,user.id,user.tenantId) as {document_json:string;revision:number}|undefined;
 let workbook=asWorkbook(row?JSON.parse(row.document_json):emptyBoard());
 if(!workbook)throw Error('Не удалось прочитать сохранённый раздел «Концепция и материалы».');
 const id='planner-render-'+renderId;
 if(workbook.sheets.some(sheet=>sheet.board.nodes.some(node=>node.id===id)))return;
 if(activeSheet(workbook).board.nodes.length>=100){
  workbook=appendSheet(workbook,id);
 }
 const board=activeSheet(workbook).board;
 const now=new Date();
 const node:MaterialNode={
  id,kind:'reference',title:'Рендер планировки',image,originalImage:image,
  x:0,y:0,width:portrait?300:450,height:portrait?450:300,
  generated:true,trayOnly:true,trayOrder:now.getTime(),
 };
 const revision=(row?.revision||0)+1,updatedAt=now.toISOString();
 const saved=db.prepare(`INSERT INTO material_boards(project_id,user_id,tenant_id,revision,document_json,updated_at)
  VALUES(?,?,?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET
  revision=excluded.revision,document_json=excluded.document_json,updated_at=excluded.updated_at
  WHERE material_boards.user_id=excluded.user_id AND material_boards.tenant_id=excluded.tenant_id`)
  .run(projectId,user.id,user.tenantId,revision,JSON.stringify(withActiveBoard(workbook,{...board,nodes:[node,...board.nodes]})),updatedAt);
 if(!saved.changes)throw Error('Не удалось добавить рендер в раздел «Концепция и материалы».');
 db.prepare('UPDATE projects SET updated_at=? WHERE id=? AND user_id=? AND tenant_id=?')
  .run(updatedAt,projectId,user.id,user.tenantId);
}
