// Local opt-in comparison; never runs on production or changes source DWGs.
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const run=promisify(execFile),[before,after,...inputs]=process.argv.slice(2);
assert.ok(before&&after&&inputs.length,'Usage: node check-decoder-regression.mjs OLD_BINARY NEW_BINARY INPUT_DWG...');
const dir=await mkdtemp(join(tmpdir(),'room-decoder-regression-'));
try{
 for(const [i,input] of inputs.entries()){
  const results=[];
  for(const [j,binary] of [before,after].entries()){
   const output=join(dir,`${i}-${j}.dxf`),r=await run(binary,['-v1','--as','r2004','-o',output,input],{timeout:30000,maxBuffer:512000});
   const bytes=await readFile(output);results.push({errors:r.stderr.split('\n').filter(l=>/^ERROR:/.test(l)),sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  assert.equal(results[0].sha256,results[1].sha256,'Conversion geometry/output changed: '+input);
  console.log(JSON.stringify({input,beforeErrors:results[0].errors,afterErrors:results[1].errors,identicalDxf:true,sha256:results[1].sha256}));
 }
}finally{await rm(dir,{recursive:true,force:true});}
