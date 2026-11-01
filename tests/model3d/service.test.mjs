import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ModelStore} from '../../services/model3d/store.mjs';
import {Coordinator} from '../../services/model3d/coordinator.mjs';
import {createModelServer} from '../../services/model3d/server.mjs';
import {sha256} from '../../services/model3d/contracts.mjs';

const owner={tenantId:'tenant-room',userId:'owner',admin:true},buyer={tenantId:'tenant-other',userId:'buyer',admin:false};
const input={name:'PHILIPPE',imageBase64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVuoAAAAASUVORK5CYII=',widthMm:600,depthMm:530,heightMm:820};
const settings={enabled:true,image:'private/trellis@sha256:'+'a'.repeat(64),engineRevision:'test-revision',publicUrl:'https://room.example/api/models3d/worker',namespace:'roomdesign-test',maxPods:1,maxSeconds:900,hourlyUsd:2.51,dailyBudgetUsd:3};
function setup(t){const root=mkdtempSync(join(tmpdir(),'model3d-test-'));const store=new ModelStore(root,{revision:'test-revision'});t.after(()=>{try{store.close();}catch{}rmSync(root,{recursive:true,force:true});});return store;}
function glb(){
 const json=Buffer.from(JSON.stringify({asset:{version:'2.0'},buffers:[{byteLength:4}],meshes:[{primitives:[{indices:0,attributes:{POSITION:1}}]}],accessors:[{count:3},{count:3}]}).padEnd(240,' '));
 const bytes=Buffer.alloc(12+8+json.length+8+4);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);bytes.writeUInt32LE(4,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);return bytes;
}
function activate(store,id,token='worker-secret'){store.db.prepare("UPDATE jobs SET state='running',token_hash=?,deadline_at=?,provision_started=?,pod_id='pod-1',pod_name=? WHERE id=?").run(sha256(token),Date.now()+60000,Date.now(),settings.namespace+'-'+id,id);}
class FakeProvider{
 constructor(){this.pods=[];this.creates=0;this.stops=[];this.uncertain=false;}
 async list(){return this.pods;}
 async create(body){this.creates++;const pod={id:'pod-'+this.creates,name:body.name,desiredStatus:'RUNNING'};this.pods.push(pod);if(this.uncertain)throw Error('timeout after provider accepted POST');return pod;}
 async stop(id){this.stops.push(id);const pod=this.pods.find(p=>p.id===id);if(pod)pod.desiredStatus='EXITED';}
}
test('idempotent requests, active dedupe, exact settings and durable cache survive restart',t=>{
 const store=setup(t),first=store.enqueue(owner,input,'request-0001');
 assert.equal(store.enqueue(owner,input,'request-0001').job.id,first.job.id);
 assert.equal(store.enqueue(owner,input,'request-0002').job.id,first.job.id);
 assert.throws(()=>store.enqueue(owner,{...input,widthMm:700},'request-0001'),/другого/);
 activate(store,first.job.id);
 const result=store.complete(store.job(first.job.id),glb());assert.equal(result.durable,true);
 assert.equal(store.complete(store.job(first.job.id),glb()).sha256,result.sha256);
 assert.equal(store.enqueue(owner,input,'request-0003').reused,true);
 assert.equal(store.enqueue(owner,{...input,widthMm:700},'request-0004').reused,false);
 assert.equal(store.readReady(store.asset(first.job.assetId,owner)).length,glb().length);
 const reopened=new ModelStore(store.root,{revision:'test-revision'});assert.equal(reopened.list(owner).length,1);reopened.close();
});
test('private references cannot be discovered or downloaded by another user; paid grant reuses ID',t=>{
 const store=setup(t),first=store.enqueue(owner,input,'request-0001');activate(store,first.job.id);store.complete(store.job(first.job.id),glb());
 assert.equal(store.list(buyer).length,0);assert.throws(()=>store.asset(first.job.assetId,buyer),/не найдена/);
 assert.equal(store.catalog(buyer).length,0);
 assert.throws(()=>store.grant(first.job.assetId,buyer,'receipt-00001'),/не опубликована/);
 store.db.prepare('UPDATE assets SET published=1,rights_confirmed=1 WHERE id=?').run(first.job.assetId);
 assert.equal(store.catalog(buyer)[0].modelUrl,null);assert.equal(store.catalog(buyer)[0].owned,false);
 store.grant(first.job.assetId,buyer,'receipt-00001');store.grant(first.job.assetId,buyer,'receipt-00001');
 assert.equal(store.asset(first.job.assetId,buyer).id,first.job.assetId);
 assert.equal(store.catalog(buyer)[0].owned,true);
 assert.throws(()=>store.grant(first.job.assetId,{...buyer,userId:'someone'},'receipt-00001'),/уже использована/);
 assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM jobs').get().n,1);
});
test('bad dimensions and corrupt/external GLB never become available',t=>{
 const store=setup(t);assert.throws(()=>store.enqueue(owner,{...input,heightMm:0},'request-0001'),/размер|ширину/);
 const first=store.enqueue(owner,input,'request-0001');activate(store,first.job.id);
 assert.throws(()=>store.complete(store.job(first.job.id),Buffer.from('fake')),/Поврежд/);
 assert.equal(store.list(owner).length,0);
 const bytes=glb(),n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n));json.buffers[0].uri='https://attacker.example/a';const changed=Buffer.from(JSON.stringify(json));const malformed=Buffer.alloc(20+changed.length);bytes.copy(malformed,0,0,20);malformed.writeUInt32LE(malformed.length,8);malformed.writeUInt32LE(changed.length,12);changed.copy(malformed,20);
 assert.throws(()=>store.complete(store.job(first.job.id),malformed),/внутри файла/);
});
test('ambiguous create is reconciled, never duplicated, including coordinator restart',async t=>{
 const store=setup(t),provider=new FakeProvider();provider.uncertain=true;
 const first=store.enqueue(owner,input,'request-0001');await new Coordinator(store,provider,settings).tick();
 assert.equal(provider.creates,1);assert.equal(store.job(first.job.id).pod_id,null);
 await new Coordinator(store,provider,settings).tick();assert.equal(store.job(first.job.id).pod_id,'pod-1');assert.equal(provider.creates,1);
 store.db.prepare('UPDATE jobs SET deadline_at=? WHERE id=?').run(Date.now()-1,first.job.id);
 await new Coordinator(store,provider,settings).tick();assert.ok(provider.stops.includes('pod-1'));assert.equal(store.job(first.job.id).state,'failed');
});
test('daily budget and disabled flag prevent paid starts; cleanup still runs',async t=>{
 const store=setup(t),provider=new FakeProvider();store.enqueue(owner,input,'request-0001');
 await new Coordinator(store,provider,{...settings,dailyBudgetUsd:0}).tick();assert.equal(provider.creates,0);
 await new Coordinator(store,provider,{...settings,enabled:false}).tick();assert.equal(provider.creates,0);
 provider.pods.push({id:'orphan',name:settings.namespace+'-orphan',desiredStatus:'RUNNING'},{id:'other-site',name:'unrelated',desiredStatus:'RUNNING'});
 await new Coordinator(store,provider,{...settings,enabled:false}).tick();assert.deepEqual(provider.stops,['orphan']);
});
test('failed provider listing cannot block a direct stop of a known expired GPU',async t=>{
 const store=setup(t),provider=new FakeProvider(),first=store.enqueue(owner,input,'request-0001');
 await new Coordinator(store,provider,settings).tick();
 store.db.prepare('UPDATE jobs SET deadline_at=? WHERE id=?').run(Date.now()-1,first.job.id);
 provider.list=async()=>{throw Error('list unavailable');};
 await new Coordinator(store,provider,settings).tick();assert.ok(provider.stops.includes('pod-1'));assert.equal(provider.creates,1);
});
test('HTTP worker authorization, lost ACK retry and private asset download',async t=>{
 const store=setup(t),provider=new FakeProvider(),secret='s'.repeat(64),config={...settings,secret};
 const {server}=createModelServer(config,store,provider);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port;
 assert.equal((await fetch(base+'/internal/assets')).status,401);
 const first=store.enqueue(owner,input,'request-0001');activate(store,first.job.id,'x'.repeat(64));
 const url=base+'/worker/jobs/'+first.job.id+'/result';
 assert.equal((await fetch(url,{method:'PUT',body:glb(),headers:{Authorization:'Bearer bad'}})).status,401);
 const options={method:'PUT',body:glb(),headers:{Authorization:'Bearer '+'x'.repeat(64)}};
 assert.equal((await fetch(url,options)).status,200);assert.equal((await fetch(url,options)).status,200);
 const auth={'x-model-service-secret':secret,'x-model-user':owner.userId,'x-model-tenant':owner.tenantId};
 assert.equal((await fetch(base+'/internal/assets/'+first.job.assetId+'/file',{headers:{...auth,'x-model-user':'other'}})).status,404);
 const response=await fetch(base+'/internal/assets/'+first.job.assetId+'/file',{headers:auth});assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),glb());
});
