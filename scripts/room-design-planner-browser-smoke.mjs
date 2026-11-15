import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {apartmentDxf} from '../tests/dxf-fixture.mjs';

const base = 'http://127.0.0.1:3902';
const browser = await chromium.launch({channel:'chromium', args:['--enable-unsafe-webgpu','--use-angle=swiftshader']});
try {
  const context = await browser.newContext();
  const api = context.request;
  const register = await api.post(base + '/api/auth/register', {data:{
    email:`planner-browser-${Date.now()}@example.test`,
    password:'LocalPlanning-Preview-987!',
    firstName:'Локальный', lastName:'Тест', phone:'+79991112233', companyRole:'designer',
    consent:true, termsAccepted:true,
  }});
  assert.ok(register.ok(), await register.text());
  const created = await api.post(base+'/api/projects', {data:{name:'Room Design Planner browser smoke'}});
  assert.ok(created.ok(), await created.text());
  const {project} = await created.json();
  const endpoint = base + '/api/projects/' + project.id + '/planning-plan';
  const start = await api.put(endpoint, {data:{action:'start-manual',revision:0,baseKind:'manual'}});
  assert.ok(start.ok(), await start.text());
  const {revision} = await start.json();
  const dxf = await api.post(endpoint+'/cad-file', {multipart:{file:{
    name:'fixture.dxf', mimeType:'application/dxf', buffer:Buffer.from(apartmentDxf()),
  }}});
  assert.ok(dxf.ok(), await dxf.text());
  const imported = await api.put(endpoint, {data:{action:'workspace-import-dxf',revision,...await dxf.json()}});
  assert.ok(imported.ok(), await imported.text());

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.addEventListener('message', event => {
      if (event.origin === location.origin && typeof event.data?.type === 'string' && event.data.type.startsWith('pascal:')) {
        document.body?.setAttribute('data-planner-' + event.data.type.slice(7), event.data.error || 'yes');
      }
    });
  });
  await page.goto(base+'/planning-plan?project='+project.id);
  await page.getByRole('tab',{name:'3D',exact:true}).click();
  const iframe = page.frameLocator('iframe[title*="Room Design Planner"]');
  await iframe.locator('canvas').waitFor({timeout:90_000});
  await page.locator('body[data-planner-loaded="yes"]').waitFor({timeout:90_000});
  assert.equal(await iframe.getByText('Plugins', {exact:true}).count(),0);
  await page.getByRole('tab',{name:'Вид из глаз',exact:true}).click();
  await iframe.locator('.is-walkthrough').waitFor();
  await page.getByRole('tab',{name:'2D',exact:true}).click();
  await page.getByRole('tab',{name:'2D',exact:true,selected:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('Browser smoke passed: opens stored DXF in 3D, walkthrough, back to 2D, no uncaught errors');
} finally {
  await browser.close();
}
