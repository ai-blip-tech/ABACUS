import assert from 'node:assert/strict';

const base = process.argv[2];
const root = '/_next/static/room-design-planner/';
const html = await fetch(base + '/room-design-planner/view');
assert.equal(html.status, 200);
assert.equal(html.headers.get("cache-control"), "no-store");
assert.match(html.headers.get('content-type'), /text\/html/);
const markup = await html.text();
assert.match(markup, /<title>Room Design Planner<\/title>/);
const urls = [...markup.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
assert.ok(urls.some(url => url.endsWith('.js')));
for (const url of urls) {
  assert.ok(url.startsWith(root), 'Planner assets must be on the same origin');
  const response = await fetch(base + url, {method: 'HEAD'});
  assert.equal(response.status, 200);
}
const notice = await fetch(base + root + 'THIRD-PARTY-LICENSES.md');
assert.equal(notice.status, 200);
assert.match(await notice.text(), /Copyright \(c\) 2026 Pascal Group Inc\./);
const model = await fetch(base + root + 'models/chair.glb');
assert.equal(model.status, 200);
assert.equal(Buffer.from(await model.arrayBuffer()).toString('ascii', 0, 4), 'glTF');
for (const method of ['POST','GET']) {
  const response = await fetch(base + '/api/catalog/model-asset?key=' + 'a'.repeat(64), {method});
  assert.equal(response.status, 401);
}
console.log('Planner HTTP smoke passed: embedded page, assets, MIT notice and converter access');

if (process.env.ROOM_DESIGN_CHECK_CABINET_LIBRARY === '1') {
  const library = base + '/api/cabinet-library/';
  const current = await fetch(library + 'current/manifest.json');
  assert.equal(current.status, 200, 'The cabinet library needs an active version');
  assert.equal(current.headers.get('cache-control'), 'no-store');
  const manifest = await current.json();
  assert.match(manifest.revision, /^[a-f0-9]{64}$/);
  const defaultCabinet = manifest.models.find(item => item.id === '5041' && item.kind === 'module');
  assert.ok(defaultCabinet, 'Missing the default cabinet');
  const glb = await fetch(library + manifest.revision + '/' + defaultCabinet.asset);
  assert.equal(glb.status, 200);
  assert.equal(Buffer.from(await glb.arrayBuffer()).toString('ascii', 0, 4), 'glTF');
  const cabinetTexture = manifest.textures.find(item => item.kind === 'ceramic');
  assert.ok(cabinetTexture, 'Missing the cabinet ceramic textures');
  const jpeg = await fetch(library + manifest.revision + '/' + cabinetTexture.asset);
  assert.equal(jpeg.status, 200);
  assert.equal(Buffer.from(await jpeg.arrayBuffer()).toString('hex', 0, 3), 'ffd8ff');
  const cabinetCatalog = await fetch(base + root + 'cabinets/catalog.json');
  assert.equal(cabinetCatalog.status, 200);
  assert.ok((await cabinetCatalog.json()).samples.length > 0);
  for (const asset of ['cover-brand-official.svg', 'norr-circle.svg']) {
    const response = await fetch(base + '/proposal/' + asset, {method: 'HEAD'});
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /image\/svg\+xml/);
  }
  console.log('Cabinet library, catalog and PowerPoint branding passed HTTP checks');
}
