import {mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {build as buildBrowser} from '../room-design-planner/node_modules/vite/dist/node/index.js';

const workspace = resolve('room-design-planner');
const requireVite = createRequire(import.meta.resolve('../room-design-planner/node_modules/vite/dist/node/index.js'));
const {build: buildConverter} = requireVite('esbuild');

await buildBrowser({configFile: resolve(workspace, 'vite.config.mjs')});
await mkdir('.next/room-design-planner-tools', {recursive: true});
await buildConverter({
  entryPoints: [resolve(workspace, 'catalog-model-convert.mjs')],
  outfile: '.next/room-design-planner-tools/catalog-model-convert.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
});
