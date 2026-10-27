// Copies the runtime files the indexer bundle needs next to main.mjs: the
// tree-sitter .wasm files and the .scm queries. The esbuild executor's asset
// globber skips node_modules (it honours .gitignore).
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'apps', 'indexer');
const files = [
  'apps/indexer/src/queries/definitions.scm',
  'node_modules/web-tree-sitter/web-tree-sitter.wasm',
  'node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm',
  'node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm',
];

mkdirSync(out, { recursive: true });
for (const file of files) {
  copyFileSync(path.join(root, file), path.join(out, path.basename(file)));
}
