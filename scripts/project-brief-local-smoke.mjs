import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fixtureDoc} from '../lib/measured-plan/measure-model.ts';
const base=process.env.MEASURE_SMOKE_BASE,url=new URL(base);
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.protocol,'http:');assert.ok(['3141','3901','3902'].includes(url.port),'Only isolated preview/candidate ports are allowed');
async function account(suffix){const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:`brief-${Date.now()}-${suffix}@example.test`,password:'LocalBrief-Preview24!',firstName:'Тест',lastName:'Брифа'})});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];}
const a=await account('a'),b=await account('b');
async function req(path,method='GET',body,cookie=a,origin=base){return fetch(base+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),Origin:origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
const create=await req('/api/projects','POST',{name:'Проверка редактирования брифа',description:'Исходное описание'});assert.equal(create.status,200);const {project}=await create.json(),path='/api/projects/'+project.id;
const empty=await (await req(path)).json();assert.equal(empty.state,null);
assert.equal((await req(path,'PATCH',{name:project.name,projectType:'Квартира',description:project.description,expectedUpdatedAt:empty.project.updated_at})).status,200);
assert.equal((await (await req(path)).json()).state,null,'Editing an empty brief must not create studio state');
const png=await readFile(new URL('../public/measured-plan-reference.png',import.meta.url));
const savedStudio=await req(path,'PUT',{name:project.name,projectType:'Квартира',description:project.description,state:{interiorImage:'data:image/png;base64,'+png.toString('base64'),planItems:[]}});assert.equal(savedStudio.status,200);
const imported=await fetch(base+path+'/measured-plan/import',{method:'POST',headers:{Cookie:a,'Content-Type':'image/png',Origin:base},body:png});assert.equal(imported.status,200);const source=await imported.json();
const doc=fixtureDoc({name:'Тест.png',mime:'image/png',hash:source.hash,width:source.width,height:source.height,page:1,pages:1,method:'prepared-user-bti',image:source.image,originalAsset:source.originalAsset,words:[],pixelScale:6.7});
assert.equal((await req(path+'/measured-plan','PUT',{revision:0,document:doc})).status,200);
const before=await (await req(path)).json(),planBefore=await (await req(path+'/measured-plan')).json();
const body={name:'Бриф обновлён',projectType:'Дом',description:'Объект и адрес: Тестовый объект\nБюджет и вилка: 2 млн',expectedUpdatedAt:before.project.updated_at};
assert.equal((await req(path,'PATCH',body,null)).status,401);
assert.equal((await req(path,'PATCH',body,b)).status,404);
assert.equal((await req(path,'PATCH',body,a,'https://untrusted.example')).status,403);
assert.equal((await req(path,'PATCH',{...body,description:'x'.repeat(1001)})).status,400);
const result=await req(path,'PATCH',body);assert.equal(result.status,200,await result.clone().text());
const after=await (await req(path)).json(),planAfter=await (await req(path+'/measured-plan')).json();
assert.equal(after.project.name,body.name);assert.equal(after.project.description,body.description);assert.equal(after.project.project_type,'Дом');assert.deepEqual(after.state,before.state);assert.deepEqual(planAfter.document,planBefore.document);assert.equal(planAfter.revision,planBefore.revision);
assert.equal((await req(path,'PATCH',body)).status,409);
console.log(JSON.stringify({passed:true,projectId:project.id,checks:['save and reload metadata','studio state preserved','measured plan and revision preserved','unauthorized 401','cross-user 404','origin 403','length 400','stale version 409']},null,2));
