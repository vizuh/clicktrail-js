import { readFile } from 'node:fs/promises';
import { compile, preprocess } from 'svelte/compiler';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const filename = new URL('../src/ClickTrail.svelte', import.meta.url);
const source = await readFile(filename, 'utf8');
const processed = await preprocess(source, vitePreprocess(), { filename: filename.pathname });
compile(processed.code, { filename: filename.pathname, generate: 'client' });
console.log('ClickTrail.svelte compile OK');
