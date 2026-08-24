#!/usr/bin/env bash
# One-time bootstrap for package names not yet on npm.
# Run from repo root in YOUR terminal: each publish opens a browser
# authorization (2FA). After this, configure Trusted Publishers on
# npmjs.com (repo vizuh/clicktrail-js, workflow publish.yml, env npm)
# for all five names, then: gh run rerun 32788003812
set -euo pipefail
for dir in packages/core packages/browser integrations/nuxt; do
  name="$(node -p "require('./$dir/package.json').name")"
  if npm view "$name" version >/dev/null 2>&1; then
    echo "$name already on npm — skipping"
  else
    echo "== Publishing $name (complete the browser auth when prompted) =="
    (cd "$dir" && npm publish --access public --tag next)
  fi
done
echo "Bootstrap done. Now add Trusted Publishers on npmjs.com for:"
echo "  @vizuh/clicktrail-core, @vizuh/clicktrail-browser, @vizuh/clicktrail,"
echo "  @vizuh/clicktrail-astro, @vizuh/clicktrail-nuxt"
echo "  -> repo: vizuh/clicktrail-js | workflow: publish.yml | environment: npm"
echo "Then: gh run rerun 32788003812"
