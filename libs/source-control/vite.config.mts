/// <reference types='vitest' />
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/source-control',
  test: {
    name: 'ascua-source-control',
    watch: false,
    globals: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/source-control',
      provider: 'v8' as const,
    },
  },
}));
