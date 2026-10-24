// Test-only compiler hook. Production Next.js keeps its own compiler and type checks.
import { register } from 'node:module';
register('./test-typescript-loader.mjs', import.meta.url);
