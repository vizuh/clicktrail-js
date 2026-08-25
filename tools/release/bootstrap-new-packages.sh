#!/usr/bin/env bash
# One-time namespace bootstrap for first-wave names missing from npm.
# This publishes a minimal 0.0.0-bootstrap.0 placeholder, never RC artifacts.
# Run locally only after npm login with Hugo's 2FA; never pass or print tokens.
set -euo pipefail

bootstrap_version='0.0.0-bootstrap.0'
mode="${1:-}"
if [ "$mode" != '--publish' ]; then
  cat <<'EOF'
Dry run only. No package was published.

This command can irreversibly publish minimal 0.0.0-bootstrap.0 placeholders
for missing first-wave npm names. It never builds or publishes RC4.

After the owner authorization record is approved, review this script and run:
  tools/release/bootstrap-new-packages.sh --publish
EOF
  exit 0
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$root"
release_version="$(node -p "require('./packages/clicktrail/package.json').version")"
CLICKTRAIL_RELEASE_VERSION="$release_version" node tools/release/verify-release-authorization.mjs

# Authentication must work before any temporary artifact is created.
npm whoami >/dev/null

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for source_manifest in \
  packages/core/package.json \
  packages/browser/package.json \
  integrations/astro/package.json \
  integrations/nuxt/package.json; do
  name="$(node -p "require('./$source_manifest').name")"
  package_release_version="$(node -p "require('./$source_manifest').version")"
  test "$package_release_version" = "$release_version" || {
    echo "refusing: $source_manifest version differs from $release_version" >&2; exit 1;
  }
  test "$package_release_version" != "$bootstrap_version" || {
    echo "refusing: $source_manifest uses reserved bootstrap version" >&2; exit 1;
  }
  if npm view "$name" version >/dev/null 2>&1; then
    printf '%s already exists on npm; skipping\n' "$name"
    continue
  fi

  slug="${name//@/}"
  slug="${slug//\//-}"
  package_dir="$tmp/$slug"
  mkdir -p "$package_dir"
  cp LICENSE "$package_dir/LICENSE"
  cat > "$package_dir/README.md" <<EOF
# $name

Namespace bootstrap placeholder for the ClickTrail project.

Install a release version from the \`next\` or \`latest\` dist-tag. Do not use
\`$bootstrap_version\` as a runtime dependency.
EOF
  PACKAGE_NAME="$name" BOOTSTRAP_VERSION="$bootstrap_version" node <<'NODE' > "$package_dir/package.json"
const manifest = {
  name: process.env.PACKAGE_NAME,
  version: process.env.BOOTSTRAP_VERSION,
  description: 'Namespace bootstrap placeholder for ClickTrail.',
  license: 'MIT',
  repository: { type: 'git', url: 'git+https://github.com/vizuh/clicktrail-js.git' },
  publishConfig: { access: 'public' },
};
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
NODE

  if npm view "$name@$bootstrap_version" version >/dev/null 2>&1; then
    echo "$name@$bootstrap_version already exists; refusing ambiguous bootstrap" >&2
    exit 1
  fi
  printf 'Publishing minimal namespace placeholder %s@%s (2FA may open)\n' "$name" "$bootstrap_version"
  npm publish "$package_dir" --access public --tag bootstrap
done

cat <<'EOF'
Bootstrap complete. Before any release tag:
1. Configure trusted publishing for all five first-wave packages.
2. Repository: vizuh/clicktrail-js
3. Workflow: .github/workflows/publish.yml
4. Environment: npm
5. Re-run the first-publication checklist and reviewed PR gates.
EOF
