/**
 * Bundles the two app-side entrypoints (panel + module) into self-contained
 * ESM files the Directus app can load directly. Hand-rolled instead of the
 * Directus extensions SDK so the toolchain stays esbuild-only.
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const entries = [
  { in: join(root, 'src/app/panel/index.ts'), out: 'dist/panel/index.js' },
  { in: join(root, 'src/app/module/index.ts'), out: 'dist/module/index.js' },
];

mkdirSync(join(root, 'dist'), { recursive: true });

for (const entry of entries) {
  await build({
    entryPoints: [entry.in],
    outfile: join(root, entry.out),
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'browser',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'info',
  });
}

console.log('app bundles written: dist/panel/index.js dist/module/index.js');
