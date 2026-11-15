import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {fileURLToPath} from 'node:url';
import editorAdaptations from './pascal-drag-only.mjs';
import itemHitPlugin from './item-hit-target.mjs';

const path = (file) => fileURLToPath(new URL(file, import.meta.url));
export default defineConfig({
  root: path('./'),
  base: '/_next/static/room-design-planner/',
  plugins: [editorAdaptations(), itemHitPlugin(), react(), tailwindcss()],
  define: {'process.env': {}},
  resolve: {
    alias: {'next/image': path('./next-image.tsx'), 'next/link': path('./next-link.tsx')},
    dedupe: ['react', 'react-dom', 'three', '@pascal-app/core', '@pascal-app/viewer'],
  },
  build: {
    outDir: path('../.next/static/room-design-planner'),
    emptyOutDir: true,
    target: 'esnext',
    license: {fileName: 'THIRD-PARTY-LICENSES.md'},
    rollupOptions: {input: path('./planning-bridge.html'), output: {inlineDynamicImports: true}},
  },
});
