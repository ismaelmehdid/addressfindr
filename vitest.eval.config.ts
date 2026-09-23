import path from 'node:path';
import { defineConfig } from 'vitest/config';

// why: le harnais de verite terrain tape Firecrawl, Groq, geo.api.gouv.fr et
// l'ADEME pour de vrai. Il consomme des credits et depend du reseau, donc il
// ne peut pas tourner dans `pnpm test` ni dans la CI — il s'invoque a la main
// via `pnpm eval:address`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.live.test.ts'],
    exclude: ['node_modules', '.next', 'dist', '.claude'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './test/server-only-shim.ts'),
    },
  },
});
