#!/usr/bin/env bash
# Verify actual packed manifests, after pnpm rewrites workspace protocols.
set -euo pipefail

pack_dir="${1:?usage: verify-packed-internal-versions.sh <pack-directory>}"
expected_version="$(node -p "require('./packages/clicktrail/package.json').version")"
found=0

for tarball in "$pack_dir"/*.tgz; do
  [ -e "$tarball" ] || continue
  found=$((found + 1))
  manifest_file="$(mktemp)"
  tar -xOf "$tarball" package/package.json > "$manifest_file"
  EXPECTED_VERSION="$expected_version" node - "$manifest_file" "$tarball" <<'NODE'
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const [manifestPath, tarballPath] = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expected = process.env.EXPECTED_VERSION;
if (manifest.version !== expected) {
  throw new Error(`${manifest.name}: packed ${manifest.version}, expected ${expected}`);
}
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const [name, version] of Object.entries(manifest[field] ?? {})) {
    if (typeof version !== 'string' || version.startsWith('workspace:')) {
      throw new Error(`${manifest.name}: ${field} ${name}@${version} is not registry-safe`);
    }
    if (field !== 'peerDependencies' && name.startsWith('@vizuh/') && version !== expected) {
      throw new Error(`${manifest.name}: ${field} ${name}@${version} must equal ${expected}`);
    }
  }
}

const frameworkRules = {
  '@vizuh/clicktrail-astro': {
    keyword: 'astro-component',
    peer: 'astro',
    directory: 'integrations/astro',
    extra: [],
  },
  '@vizuh/clicktrail-nuxt': {
    keyword: 'nuxt-module',
    peer: 'nuxt',
    directory: 'integrations/nuxt',
    extra: [],
  },
  '@vizuh/clicktrail-sveltekit': {
    keyword: 'sveltekit',
    peer: '@sveltejs/kit',
    directory: 'integrations/sveltekit',
    extra: ['package/src/ClickTrail.svelte'],
  },
};
const rule = frameworkRules[manifest.name];
if (rule) {
  if (!manifest.description || manifest.license !== 'MIT' || !manifest.author) {
    throw new Error(`${manifest.name}: missing public description, MIT license, or author metadata`);
  }
  if (!Array.isArray(manifest.keywords) || !manifest.keywords.includes(rule.keyword)) {
    throw new Error(`${manifest.name}: missing directory keyword ${rule.keyword}`);
  }
  if (!manifest.peerDependencies?.[rule.peer] || manifest.peerDependencies[rule.peer].startsWith('workspace:')) {
    throw new Error(`${manifest.name}: missing registry-safe peer dependency ${rule.peer}`);
  }
  if (manifest.repository?.directory !== rule.directory ||
      manifest.homepage !== `https://github.com/vizuh/clicktrail-js/tree/master/${rule.directory}#readme` ||
      manifest.bugs?.url !== 'https://github.com/vizuh/clicktrail-js/issues') {
    throw new Error(`${manifest.name}: repository, homepage, or issue-tracker metadata is inaccurate`);
  }
  const entries = new Set(execFileSync('tar', ['-tzf', tarballPath], { encoding: 'utf8' }).trim().split(/\r?\n/));
  for (const path of ['package/README.md', 'package/LICENSE', 'package/dist/', ...rule.extra]) {
    if (![...entries].some((entry) => entry === path || entry.startsWith(path))) {
      throw new Error(`${manifest.name}: packed artifact is missing ${path}`);
    }
  }
  const exportTargets = (value) => {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object') return Object.values(value).flatMap(exportTargets);
    return [];
  };
  for (const target of exportTargets(manifest.exports)) {
    if (target.startsWith('./') && !entries.has(`package/${target.slice(2)}`)) {
      throw new Error(`${manifest.name}: packed export target is missing ${target}`);
    }
  }
}
NODE
  rm -f "$manifest_file"
done

if [ "$found" -eq 0 ]; then
  echo "no tarballs found in $pack_dir" >&2
  exit 1
fi

printf 'verified exact internal versions in %s packed package(s)
' "$found"
