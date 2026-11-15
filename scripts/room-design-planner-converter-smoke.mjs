import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {crc32} from 'node:zlib';

const exec = promisify(execFile);
const tools = resolve('.next/room-design-planner-tools');
const packaged = join(tools, 'archive/bsdtar');
const archiveTool = existsSync(packaged) ? packaged : '/usr/bin/bsdtar';
const converter = join(tools, 'catalog-model-convert.mjs');
const fixture = Buffer.from('o Cube\nv 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 3 2\nf 1 2 4\nf 1 4 3\nf 2 3 4\n');

function rarBlock(type, flags, body) {
  const header = Buffer.alloc(7);
  header.writeUInt8(type, 2);
  header.writeUInt16LE(flags, 3);
  header.writeUInt16LE(header.length + body.length, 5);
  header.writeUInt16LE(crc32(Buffer.concat([header.subarray(2), body])) & 0xffff, 0);
  return Buffer.concat([header, body]);
}

function rarFixture(name) {
  const body = Buffer.alloc(25);
  body.writeUInt32LE(fixture.length, 0);
  body.writeUInt32LE(fixture.length, 4);
  body[8] = 3;
  body.writeUInt32LE(crc32(fixture), 9);
  body[17] = 20;
  body[18] = 0x30;
  body.writeUInt16LE(name.length, 19);
  body.writeUInt32LE(0o100644, 21);
  return Buffer.concat([
    Buffer.from('526172211a0700', 'hex'),
    rarBlock(0x73, 0, Buffer.alloc(6)),
    rarBlock(0x74, 0x8000, Buffer.concat([body, Buffer.from(name)])),
    fixture,
    rarBlock(0x7b, 0, Buffer.alloc(0)),
  ]);
}

const dir = await mkdtemp(join(tmpdir(), 'room-planner-converter-'));
try {
  const rar = join(dir, 'fixture.rar');
  const zip = join(dir, 'fixture.zip');
  await writeFile(rar, rarFixture('model.obj'));
  await writeFile(join(dir, 'model.obj'), fixture);
  await exec(archiveTool, ['-a', '-cf', zip, 'model.obj'], {cwd: dir});
  for (const input of [rar, zip]) {
    const output = input + '.glb';
    const {stdout} = await exec(process.execPath, [converter, input, output, '[400,400,400]'], {
      env: {...process.env, ROOM_DESIGN_ARCHIVE_TOOL: archiveTool},
      timeout: 30000,
    });
    const report = JSON.parse(stdout);
    assert.deepEqual(report.dimensionsMm, [400, 400, 400]);
    assert.equal(report.triangles, 4);
    assert.equal(report.source, 'OBJ');
    const bytes = await readFile(output);
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
  }
  const unsafe = join(dir, 'traversal.rar');
  await writeFile(unsafe, rarFixture('../model.obj'));
  await assert.rejects(exec(process.execPath, [converter, unsafe, unsafe+'.glb', '[400,400,400]'], {
    env: {...process.env, ROOM_DESIGN_ARCHIVE_TOOL: archiveTool}, timeout: 30000,
  }), /Небезопасная структура архива/);
  console.log(`Converter smoke passed on ${process.platform}: RAR and ZIP to GLB, path traversal rejected`);
} finally {
  await rm(dir, {recursive: true, force: true});
}
