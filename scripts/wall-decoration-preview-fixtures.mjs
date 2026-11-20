// Creates a separate local demonstration project; never touches the source project.
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
import {blankDoc} from '../lib/measured-plan/measure-model.ts';
import {fillRegion} from '../room-design-planner/tile-wall-fill.mjs';
const data=process.env.ROOM_DESIGN_DATA_DIR;
if(!data?.startsWith('/private/tmp/'))throw Error('Only isolated local preview data is allowed');
const db=new DatabaseSync(join(data,'room-design.sqlite'));
const baseId=process.argv[2];if(!baseId)throw Error('Provide the base preview project ID');
const owner=db.prepare('SELECT user_id,tenant_id FROM projects WHERE id=?').get(baseId);if(!owner)throw Error('Preview project not found');
const name='Декорирование стен — тестовый стенд',existing=db.prepare('SELECT id FROM projects WHERE user_id=? AND tenant_id=? AND name=?').get(owner.user_id,owner.tenant_id,name);
if(existing){console.log('PREVIEW_PROJECT='+existing.id);process.exit(0);}
const source=db.prepare('SELECT document_json FROM planning_plans WHERE project_id=?').get(baseId),album=JSON.parse(source.document_json),id=crypto.randomUUID(),date=new Date().toISOString();
function fixture(name,points){const plan=blankDoc({name,mime:'application/x-room-plan',hash:'wall-decoration-preview-'+name,width:1,height:1,page:1,pages:1,method:'manual',image:'',words:[],pixelScale:1});plan.name=name;plan.id=crypto.randomUUID();plan.floor=points;plan.height=2800;plan.walls=points.map((a,i)=>({id:'demo-wall-'+i,name:'Стена '+(i+1),a,b:points[(i+1)%points.length],height:2800,thickness:120,group:'outer',lengthConfirmed:true,thicknessConfirmed:true,provenance:'Тестовый стенд превью'}));plan.roomLabels=[{id:'demo-room',name,anchor:[points[0][0]+500,points[0][1]+500]}];return plan;}
const bathroom=fixture('Ванная — стыки плитки',[[0,0],[3200,0],[3200,2200],[0,2200]]);
bathroom.openings=[{id:'demo-door',wallId:'demo-wall-2',kind:'door',offset:2300,width:800,height:2100,sill:0,confirmed:true,hingesSide:'left',swingDirection:'inward'},{id:'demo-window',wallId:'demo-wall-0',kind:'window',offset:1500,width:1000,height:800,sill:1300,confirmed:true}];
for(const [i,width] of [[0,3.2],[1,2.2]]){const tiled=fillRegion(width,2.8,1,{productId:'norrmobler:34339',angle:90,joint:.002,grout:'#e3ddd3',origin:[.06,i===1?.03:0]},i===0?[[1,1.3,2,2.1]]:[],[.06,0,width-.06,2.8]);bathroom.walls[i].plannerFinish={roomDesignTiles:tiled.pieces,roomDesignTileSettings:{joint:.002,grout:'#e3ddd3'}};}
const lshape=fixture('Г-образная комната',[[0,0],[6000,0],[6000,2400],[3400,2400],[3400,4500],[0,4500]]);
lshape.openings=[{id:'l-window',wallId:'demo-wall-0',kind:'window',offset:2700,width:1400,height:1400,sill:900,confirmed:true},{id:'l-door',wallId:'demo-wall-4',kind:'door',offset:900,width:900,height:2100,sill:0,confirmed:true}];
const narrow=fixture('Узкая ванная',[[0,0],[1400,0],[1400,3800],[0,3800]]);
narrow.openings=[{id:'narrow-door',wallId:'demo-wall-0',kind:'door',offset:700,width:700,height:2100,sill:0,confirmed:true}];
const docs=[bathroom,lshape,narrow].map(plan=>({version:1,source:{kind:'manual',revision:null},plan}));
album.source=docs[0].source;album.activeVariantId='manual';album.selected=null;album.variants={manual:{...album.variants.manual,plan:bathroom,revision:1,origin:'manual',updatedAt:date}};album.manualWorkspace={active:'manual',drafts:{manual:docs[0]},history:[],sheets:{manual:docs},activeSheets:{manual:0}};
db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO projects (id,user_id,tenant_id,name,project_type,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id,owner.user_id,owner.tenant_id,name,'Тестовый стенд','Только локальное превью. Листы: ванная с окном и дверью, Г-образная комната, узкая ванная.',date,date);db.prepare('INSERT INTO planning_plans(project_id,user_id,tenant_id,revision,document_json,updated_at) VALUES(?,?,?,?,?,?)').run(id,owner.user_id,owner.tenant_id,1,JSON.stringify(album),date);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
writeFileSync('/private/tmp/roomdesign-wall-decoration-demo-project.txt',id);console.log('PREVIEW_PROJECT='+id);
