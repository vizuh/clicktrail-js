import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
const lockfile = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8');
const errors = [];
const packages = [];
for (const group of ['packages', 'integrations']) {
  const base = path.join(root, group);
  for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory() || (group === 'integrations' && entry.name === 'activepieces')) continue;
    const dir = path.join(base, entry.name);
    const manifestPath = path.join(dir, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const rel = `${group}/${entry.name}`;
    packages.push(rel);
    if (!manifest.name) errors.push(`${rel}: package.json has no name`);
    for (const script of ['test', 'build']) if (!manifest.scripts?.[script]) errors.push(`${rel}: package.json must define scripts.${script}`);
    if (!new RegExp(`^  ${rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`, 'm').test(lockfile)) errors.push(`${rel}: pnpm-lock.yaml has no importer; run pnpm install --lockfile-only`);
    const hasJs = fs.existsSync(path.join(dir, 'src')) && [...fs.readdirSync(path.join(dir, 'src'), { recursive: true })].some((file) => String(file).endsWith('.js'));
    if (hasJs && !fs.existsSync(path.join(dir, 'tsconfig.json'))) errors.push(`${rel}: JavaScript source requires tsconfig.json for root pnpm typecheck`);
  }
}
if (errors.length) {
  console.error('Workspace contract FAILED. Fix the first reported boundary, then rerun:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Workspace contract passed for ${packages.length} packages.`);
