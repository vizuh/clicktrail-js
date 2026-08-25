#!/usr/bin/env bash
# Verify the actual packed manifests, after pnpm rewrites workspace protocols.
set -euo pipefail

pack_dir="${1:?usage: verify-packed-internal-versions.sh <pack-directory>}"
expected_version="$(node -p "require('./packages/clicktrail/package.json').version")"
found=0

for tarball in "$pack_dir"/*.tgz; do
  [ -e "$tarball" ] || continue
  found=$((found + 1))
  manifest_file="$(mktemp)"
  tar -xOf "$tarball" package/package.json > "$manifest_file"
  EXPECTED_VERSION="$expected_version" node - "$manifest_file" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const expected = process.env.EXPECTED_VERSION;
if (manifest.version !== expected) {
  throw new Error(`${manifest.name}: packed ${manifest.version}, expected ${expected}`);
}
for (const field of ['dependencies', 'optionalDependencies']) {
  for (const [name, version] of Object.entries(manifest[field] ?? {})) {
    if (name.startsWith('@vizuh/') && version !== expected) {
      throw new Error(`${manifest.name}: ${field} ${name}@${version} must equal ${expected}`);
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
