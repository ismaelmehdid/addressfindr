import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    // why: les tests `.live.` tapent Firecrawl, Groq et les API publiques
    // pour de vrai. Ils consomment des credits et dependent du reseau, donc
    // ils restent hors de `pnpm test` et de la CI — `pnpm eval:address`.
    exclude: ['node_modules', '.next', 'dist', '.claude', '**/*.live.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'server-only': path.resolve(__dirname, './test/server-only-shim.ts'),
    },
  },
});
