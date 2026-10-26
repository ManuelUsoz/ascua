/// <reference types='vitest' />
import { defineConfig } from 'vite';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/libs/notes',
  plugins: [nxViteTsPaths()],
  test: {
    name: 'ascua-notes',
    watch: false,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/libs/notes',
      provider: 'v8' as const,
    },
  },
}));
