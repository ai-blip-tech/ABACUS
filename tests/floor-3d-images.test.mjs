import test from 'node:test';
import assert from 'node:assert/strict';
import {embedFloorImages, floorImageURL} from '../room-design-planner/floor-texture-images.mjs';

test('3D embeds the base decor and every replacement, retaining cell rotations and grid coordinates', async () => {
  const tile = {image:'/api/catalog/floor-texture?id=base&v=1', widthMm:1200, heightMm:600};
  const region = {tile, origin:[300,700], angle:90, tileCells:{
    '1:2':{rotation:180,product:{image:'/replacement.jpg',tile:{...tile,image:'/replacement.jpg'}}},
    '2:2':{rotation:180},
  }};
  const before = structuredClone(region), requests = [];
  const result = await embedFloorImages(region, 'https://room.example', async url => {
    requests.push(url);
    return 'data:image/jpeg;base64,' + Buffer.from(url).toString('base64');
  });
  assert.deepEqual(region, before);
  assert.deepEqual(requests.sort(), ['https://room.example/api/catalog/floor-texture?id=base&v=3','https://room.example/replacement.jpg']);
  assert.match(result.tile.image, /^data:/);
  assert.match(result.tileCells['1:2'].product.tile.image, /^data:/);
  assert.equal(result.tileCells['1:2'].rotation, 180);
  assert.deepEqual(result.tileCells['2:2'], {rotation:180});
  assert.deepEqual(result.origin, [300,700]);
  assert.equal(result.angle, 90);
});

test('3D embeds real-scale parquet repeats and propagates failed protected-asset loads', async () => {
  const region = {product:{image:'/api/floor-parquet/WoodFloor042/Color',repeat:{widthMm:1300,heightMm:650}}};
  const result = await embedFloorImages(region,'https://room.example',async ()=>'data:image/jpeg;base64,AA');
  assert.deepEqual(result.product.repeat,region.product.repeat);
  assert.equal(result.product.image,'data:image/jpeg;base64,AA');
  await assert.rejects(embedFloorImages(region,'https://room.example',async()=>{throw Error('401');}),/401/);
  assert.equal(floorImageURL('https://supplier.example/tile.jpg','https://room.example'),'https://supplier.example/tile.jpg');
});
