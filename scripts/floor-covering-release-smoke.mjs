import assert from 'node:assert/strict';
import {apartmentDxf} from '../tests/dxf-fixture.mjs';
import {ambientParquet} from '../lib/floor-2/ambient-parquet.ts';
import {assignProduct,regionFromRoom} from '../lib/floor-2/model.ts';
import {detectedRooms} from '../lib/measured-plan/measure-rooms.ts';
const base=process.env.FLOOR_SMOKE_BASE,url=new URL(base);assert.equal(url.hostname,'127.0.0.1');assert.ok(['3901','3902'].includes(url.port),'Isolated candidate only');
async function account(suffix){const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`floor-${Date.now()}-${suffix}@example.test`,password:'Floor-Release-Only24!',firstName:'Тест',lastName:'Покрытия'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const a=await account('a'),b=await account('b');
const req=(path,method='GET',body,cookie=a,origin=base)=>fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),Origin:origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
const created=await(await req('/api/projects','POST',{name:'Floor covering isolated release smoke'})).json(),root='/api/projects/'+created.project.id,planning=root+'/planning-plan',floor=root+'/floor-2';
assert.equal((await req(floor,'GET',undefined,null)).status,401);assert.equal((await req(floor,'GET',undefined,b)).status,404);
let r=await req(planning,'PUT',{action:'start-manual',revision:0,baseKind:'manual'});assert.equal(r.status,200);let data=await r.json();
const f=new FormData();f.set('file',new File([apartmentDxf()],'floor.dxf'));r=await fetch(base+planning+'/cad-file',{method:'POST',headers:{Cookie:a,Origin:base},body:f});assert.equal(r.status,200);const cad=await r.json();
r=await req(planning,'PUT',{action:'workspace-import-dxf',revision:data.revision,...cad});assert.equal(r.status,200);
r=await req(floor);assert.equal(r.status,200);const source=await r.json(),plan=source.document.plan,rooms=detectedRooms(plan);assert.ok(rooms.length>0);plan.floorRegions=[assignProduct(regionFromRoom(plan,rooms[0],'release_floor_cover'),ambientParquet.find(p=>p.id==='WoodFloor042'))];
const payload={revision:source.revision,document:{...source.document,plan,layeringVersion:1}};
assert.equal((await req(floor,'PUT',payload,a,'https://wrong.test')).status,403);assert.equal((await req(floor,'PUT',payload,b)).status,404);
r=await req(floor,'PUT',payload);assert.equal(r.status,200);const saved=await r.json();assert.equal(saved.revision,source.revision+1);assert.equal((await req(floor,'PUT',payload)).status,409);
const loaded=await(await req(floor)).json(),linked=await(await req(planning)).json();assert.deepEqual(loaded.document.plan.floorRegions,linked.document.variants.manual.plan.floorRegions);assert.deepEqual(loaded.document.plan.floorRegions[0].product.repeat,{widthMm:1300,heightMm:650});
assert.equal((await req('/api/floor-parquet/WoodFloor032/Color','GET',undefined,null)).status,401);let total=0;
for(const p of ambientParquet){r=await req('/api/floor-parquet/'+p.id+'/Color');assert.equal(r.status,200,p.id);assert.match(r.headers.get('content-type'),/image\/jpeg/);const bytes=await r.arrayBuffer();assert.ok(bytes.byteLength>1000&&bytes.byteLength<8000000);total+=bytes.byteLength;}
r=await req('/api/catalog?scope=surfaces&type=porcelain&covering=1&limit=6');assert.equal(r.status,200);assert.ok((await r.json()).products.length>0,'Approved surface catalog must be available');
assert.equal((await req('/planning-floor-2')).status,200);assert.equal((await req('/floor-layout/print')).status,200);
console.log(JSON.stringify({passed:true,checks:['tenant isolation','same-origin','revision conflict','save/reload','planning 2D synchronization','20 server parquet previews','real repeat dimensions','approved tile catalog'],parquetPreviewBytes:total}));
