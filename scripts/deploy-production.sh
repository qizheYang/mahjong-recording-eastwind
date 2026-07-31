#!/usr/bin/env bash
set -Eeuo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote="${EASTWIND_DEPLOY_REMOTE:-root@137.184.81.194}"
ssh_key="${EASTWIND_DEPLOY_SSH_KEY:-/Users/charlesyang/.ssh/id_ed25519}"
artifact_dir="$(mktemp -d)"
content_id="$(shasum -a 256 "$root_dir/packages/server/src/services/authorization-service.ts" "$root_dir/packages/server/src/ws/handler.ts" | shasum -a 256 | cut -c1-12)"
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$content_id"
staging="/var/tmp/eastwind-recording-deploy-$release_id"

trap 'rm -rf -- "$artifact_dir"' EXIT
cd "$root_dir"
npm test
npm run typecheck
npm run build

COPYFILE_DISABLE=1 tar -czf "$artifact_dir/recording-source.tgz" \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='node_modules' \
  --exclude='*/node_modules' \
  --exclude='.env' \
  --exclude='data' \
  --exclude='packages/client/dist' \
  --exclude='packages/server/dist' \
  package.json package-lock.json packages tests vitest.config.ts tsconfig.base.json
(
  cd "$artifact_dir"
  shasum -a 256 recording-source.tgz > SHA256SUMS
)

ssh -i "$ssh_key" -o IdentitiesOnly=yes "$remote" "install -d -m 0700 '$staging'"
scp -i "$ssh_key" -o IdentitiesOnly=yes \
  "$artifact_dir/recording-source.tgz" "$artifact_dir/SHA256SUMS" \
  ops/server/promote-recording-release "$remote:$staging/"
ssh -i "$ssh_key" -o IdentitiesOnly=yes "$remote" \
  "chmod 0700 '$staging/promote-recording-release' && '$staging/promote-recording-release' '$staging' '$release_id'"

curl -fsS https://eastwindriichi.com/recording/api/health >/dev/null
curl -fsSI https://eastwindriichi.com/recording/ >/dev/null
echo "Recording $release_id deployed and verified with scp"
