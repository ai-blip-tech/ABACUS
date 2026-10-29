import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {apartmentDxf} from '../tests/dxf-fixture.mjs';
const base=process.env.PLANNING_SMOKE_BASE,url=new URL(base);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.ok(['3901','3902'].includes(url.port),'Isolated candidate only, never preview/production');
async function account(suffix){const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`planning-${Date.now()}-${suffix}@example.test`,password:'LocalPlanning-Preview24!',firstName:'Тест',lastName:'Планировки'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const a=await account('a'),b=await account('b');
const req=(path,method='GET',body,cookie=a,origin=base)=>fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const created=await(await req('/api/projects','POST',{name:'Planning isolated release smoke'})).json(),path=`/api/projects/${created.project.id}/planning-plan`;
assert.equal((await req(path,'GET',undefined,null)).status,401);assert.equal((await req(path,'GET',undefined,b)).status,404);assert.equal((await req(path,'PUT',{action:'start-manual',revision:0,baseKind:'manual'},a,'https://wrong.test')).status,403);
let response=await req(path,'PUT',{action:'start-manual',revision:0,baseKind:'manual'});assert.equal(response.status,200);let data=await response.json();assert.equal(data.document.manualWorkspace.sheets.manual.length,3);
assert.equal((await req(path,'PUT',{action:'create-demo',revision:data.revision})).status,400);assert.equal((await req(path+'/generate','POST',{revision:data.revision})).status,404);
async function upload(content,name){const f=new FormData();f.set('file',new File([content],name));return fetch(base+path+'/cad-file',{method:'POST',headers:{Cookie:a,Origin:base},body:f});}
response=await upload(apartmentDxf(),'control.dxf');assert.equal(response.status,200);const file=await response.json();
response=await req(path,'PUT',{action:'workspace-import-dxf',revision:data.revision,...file});assert.equal(response.status,200);data=await response.json();const first=structuredClone(data.document.variants.manual.plan);assert.equal(data.document.manualWorkspace.sheets.archicad.length,3);
response=await req(path,'PUT',{action:'workspace-sheet',index:1,revision:data.revision});assert.equal(response.status,200);data=await response.json();const second=structuredClone(data.document.variants.manual.plan);assert.notEqual(first.id,second.id);second.walls[0].name='Edited only sheet 2';
response=await req(path,'PUT',{action:'workspace-save',revision:data.revision,plan:second});assert.equal(response.status,200);data=await response.json();
assert.equal((await req(path,'PUT',{action:'workspace-save',revision:data.revision-1,plan:second})).status,409);
response=await req(path,'PUT',{action:'workspace-sheet',index:0,revision:data.revision});assert.equal(response.status,200);data=await response.json();assert.deepEqual(data.document.variants.manual.plan,first);
response=await req(path,'PUT',{action:'workspace-sheet',index:1,revision:data.revision});assert.equal(response.status,200);data=await response.json();assert.equal(data.document.variants.manual.plan.walls[0].name,'Edited only sheet 2');assert.equal((await(await req(path)).json()).document.manualWorkspace.activeSheets.archicad,1);
response=await req(path+'/print');assert.equal(response.status,200);assert.ok((await PDFDocument.load(await response.arrayBuffer())).getPageCount()>=2);
const baseline=JSON.stringify((await(await req(path)).json()).document);response=await upload('not a DWG','bad.dwg');assert.equal(response.status,400);assert.equal(JSON.stringify((await(await req(path)).json()).document),baseline);
let dwg='not tested: no input supplied';
if(process.env.PLANNING_SMOKE_DWG){response=await upload(await readFile(process.env.PLANNING_SMOKE_DWG),'test.dwg');const payload=await response.json();dwg={status:response.status,error:payload.error||null};assert.equal(JSON.stringify((await(await req(path)).json()).document),baseline);}
console.log(JSON.stringify({passed:true,checks:['tenant isolation','origin','independent three sheets','save/reload','409 conflict protection','DXF direct conversion','PDF','bad import preserves draft','AI route absent / demo rejected'],dwg},null,2));
