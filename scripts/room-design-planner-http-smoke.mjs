import assert from 'node:assert/strict';

const base = process.argv[2];
const root = '/_next/static/room-design-planner/';
const html = await fetch(base + root + 'planning-bridge.html');
assert.equal(html.status, 200);
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
