import test from 'node:test';
import assert from 'node:assert/strict';
import {readCadFile} from '../lib/planning-plan/cad-file.ts';
import {chmod} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
test('DXF bytes decode locally without a converter',async()=>{const text='0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nEOF\n';const r=await readCadFile(new TextEncoder().encode(text),'план.dxf');assert.equal(r.text,text);assert.deepEqual(r.warnings,[]);});
test('invalid extension, signature, empty and oversized uploads fail before conversion',async()=>{for(const [bytes,name] of [[new Uint8Array(),'a.dwg'],[new Uint8Array(2_000_001),'a.dwg'],[new TextEncoder().encode('not a DWG'),'a.dwg'],[new TextEncoder().encode('AC1018'),'x.exe']])await assert.rejects(readCadFile(bytes,name));});
test('missing converter does not fall back to a remote service',async()=>{const old=process.env.ROOM_DWG_CONVERTER;process.env.ROOM_DWG_CONVERTER='/private/tmp/room-dwg-nonexistent-tool';try{await assert.rejects(readCadFile(new TextEncoder().encode('AC1018xxxx'),'a.dwg'),/недоступен/);}finally{if(old===undefined)delete process.env.ROOM_DWG_CONVERTER;else process.env.ROOM_DWG_CONVERTER=old;}});
test('decoder diagnostics allow an available DXF for subsequent parsing and manual repair',async()=>{
 const old=process.env.ROOM_DWG_CONVERTER;
 try{
  for(const fixture of ['dwg-decoder-error.sh','dwg-decoder-warning.sh','dwg-decoder-partial.sh']){
   const executable=fileURLToPath(new URL('./fixtures/'+fixture,import.meta.url));
   await chmod(executable,0o700);process.env.ROOM_DWG_CONVERTER=executable;
   const result=await readCadFile(new TextEncoder().encode('AC1018xxxx'),'a.dwg');assert.match(result.text,/\$INSUNITS/);assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/могла измениться/);
  }
 }finally{if(old===undefined)delete process.env.ROOM_DWG_CONVERTER;else process.env.ROOM_DWG_CONVERTER=old;}
});
test('no DXF result still stops import',async()=>{const old=process.env.ROOM_DWG_CONVERTER;try{const executable=fileURLToPath(new URL('./fixtures/dwg-decoder-no-output.sh',import.meta.url));await chmod(executable,0o700);process.env.ROOM_DWG_CONVERTER=executable;await assert.rejects(readCadFile(new TextEncoder().encode('AC1018xxxx'),'a.dwg'),/не создал DXF/);}finally{if(old===undefined)delete process.env.ROOM_DWG_CONVERTER;else process.env.ROOM_DWG_CONVERTER=old;}});
