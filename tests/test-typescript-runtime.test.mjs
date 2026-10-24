import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('test runtime compiles enums and parameter properties with native TypeScript disabled', () => {
  const output = execFileSync(process.execPath, [
    '--no-experimental-strip-types', '--import', './scripts/register-test-typescript.mjs',
    '--input-type=module', '-e',
    "import {sample} from './tests/fixtures/test-typescript-runtime.ts'; console.log(JSON.stringify(sample));",
  ], { cwd: new URL('../', import.meta.url), encoding: 'utf8' });
  assert.deepEqual(JSON.parse(output), { length: 5000, unit: 'mm' });
});

test('unit tests include measured-plan TypeScript tests and do not require native transform support', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.scripts['test:unit'], /--no-experimental-strip-types --import \.\/scripts\/register-test-typescript\.mjs/);
  assert.match(pkg.scripts['test:unit'], /tests\/measure-\*\.test\.ts/);
  assert.doesNotMatch(pkg.scripts['test:unit'], /experimental-transform-types/);
});
