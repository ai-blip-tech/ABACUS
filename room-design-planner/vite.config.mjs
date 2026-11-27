import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import editorAdaptations from './pascal-drag-only.mjs';
import itemHitPlugin from './item-hit-target.mjs';

const path = (file) => fileURLToPath(new URL(file, import.meta.url));
const output = path('../.next/static/room-design-planner');
function omitLegacyCabinetAssets() {
 return {
  name:'room-design-omit-legacy-cabinet-assets',
  apply:'build',
  async closeBundle() {
   const directory=join(output,'cabinets');
   const files=await readdir(directory);
   await Promise.all(files.filter(file=>/\.(?:glb|jpg)$/i.test(file)).map(file=>rm(join(directory,file))));
  },
 };
}
export default defineConfig({
  root: path('./'),
  base: '/_next/static/room-design-planner/',
  plugins: [editorAdaptations(), itemHitPlugin(), react(), tailwindcss(), omitLegacyCabinetAssets()],
  define: {'process.env': {}},
  resolve: {
    alias: {
      '@': path('../'),
      'next/image': path('./next-image.tsx'),
      'next/link': path('./next-link.tsx'),
      'polygon-clipping': fileURLToPath(import.meta.resolve('polygon-clipping')),
    },
    dedupe: ['react', 'react-dom', 'three', '@pascal-app/core', '@pascal-app/viewer'],
  },
  build: {
    outDir: output,
    emptyOutDir: true,
    target: 'esnext',
    license: {fileName: 'THIRD-PARTY-LICENSES.md'},
    rollupOptions: {input: [path('./planning-bridge.html'), path('./cabinet-proposal.html')]},
  },
});
