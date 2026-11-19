import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadSurfaceCatalog,surfaceCatalogNotice} from '../lib/surface-catalog.ts';

test('supplier timeout keeps approved persisted products available and throttles retries',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'roomdesign-surface-outage-'));
 const previousDirectory=process.env.ROOM_DESIGN_DATA_DIR,previousFetch=globalThis.fetch;
 const products=[{id:'approved-tile',name:'Previously checked tile',image:'https://norrmobler.ru/tile.jpg'}];
 process.env.ROOM_DESIGN_DATA_DIR=directory;
 const file=path.join(directory,'surface-catalog-approved-v2.json');await writeFile(file,JSON.stringify({until:Date.now()-1000,products}));
 let attempts=0;globalThis.fetch=async()=>{attempts++;throw new Error('Supplier timeout');};
 try{
  assert.deepEqual(await loadSurfaceCatalog(),products);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(await loadSurfaceCatalog(),products);
  assert.deepEqual(await loadSurfaceCatalog(),products);
  assert.equal(attempts,1);
  assert.match(surfaceCatalogNotice(),/сохранённый каталог/);
  assert.deepEqual(JSON.parse(await readFile(file,'utf8')).products,products);
 }finally{globalThis.fetch=previousFetch;if(previousDirectory===undefined)delete process.env.ROOM_DESIGN_DATA_DIR;else process.env.ROOM_DESIGN_DATA_DIR=previousDirectory;await rm(directory,{recursive:true,force:true});}
});
