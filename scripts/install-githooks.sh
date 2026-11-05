#!/usr/bin/env bash
# Points git at .githooks/ (the privacy guard). The setting lives in the common git dir, so one
# run covers the primary checkout and every lane. Idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."
config="$(git rev-parse --path-format=absolute --git-common-dir)/config"
current=$(git config --file "$config" --get core.hooksPath || true)
if [ "$current" = .githooks ]; then
  echo "install-githooks: core.hooksPath is already .githooks"
  exit 0
fi
[ -n "$current" ] && echo "install-githooks: replacing core.hooksPath '$current'" >&2
git config --file "$config" core.hooksPath .githooks
echo "install-githooks: core.hooksPath = .githooks"
