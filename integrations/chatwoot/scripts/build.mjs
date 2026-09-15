import { cp, mkdir, rm } from 'node:fs/promises';
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await cp(new URL('../src/index.js', import.meta.url), new URL('../dist/index.js', import.meta.url));
await cp(new URL('../src/referral.js', import.meta.url), new URL('../dist/referral.js', import.meta.url));
