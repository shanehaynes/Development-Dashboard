#!/usr/bin/env bash
# Run by lane.sh in every new worktree. No secrets to pull: the dashboard has none.
set -euo pipefail
npm ci --no-audit --no-fund
