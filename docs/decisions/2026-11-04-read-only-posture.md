# The dashboard derives status and never writes into a repo

Date: 2026-11-04 · Status: accepted

## Context

Declared status rots, and in one direction. On 2026-11-03 Apex's `origin/main` was stale in four places: open-signup said "M3 in review" though #493 had merged; ios-required-check said "M2 in review" though #517 had merged; W16 said "M3b in review" though #473 had merged; W16 M1 showed 0 of 5 boxes though #430 had shipped it. A lane's last write precedes its merge, so a declared status stops at "in review".

Git alone misleads too. The same day, 11–12 of 18 claimed Apex lanes read "not landed" by merge-tree although their PRs had merged: a squash-merged branch is never an ancestor of `main`, and once `main` moves on, a merge-tree check stops matching.

## Options

- **A `status.json` per repo, written by sessions** — machine-readable / the same rot (written before the merge), plus a hot file in every repo.
- **Emitter hooks in each target repo** (Stop, PostToolUse) posting events — near real-time / edits held settings in every repo, misses merges done on GitHub, and the event log becomes a second truth.
- **An API and a database that sessions post to** — central / a service to run and secure, and the status is still declared.
- **Derive** — repos hold only facts true at the commit that wrote them (items, order, steps, who a step rests on, ticks); everything time-varying is computed from `origin/main`, live worktrees, the session registry, claims and `gh` / derivation becomes the product's main complexity, and the registry format is undocumented.

## Decision

Derive. Where sources disagree, the dashboard shows drift and trusts neither. PR state decides whether a lane landed; merge-tree is the fallback.

Rules for every phase: the dashboard never writes into a repo and never fetches. Git runs read-only with optional locks off; "GitHub is ahead" comes from `git ls-remote`. It never reads transcript contents or `.key` files. It writes only under `~/.devdash/`: the snapshot cache and acks. Sessions write their own repo, `blocked.tsv`, the Chrome lock under `~/.devdash/locks/` and, from phase 8, heartbeat files under `~/.devdash/heartbeat/`.

Two append channels carry what derivation cannot see (`blocked.sh` in phase 2; the readers and the Done button in phase 4):

- `~/.devdash/acks.tsv`: Shane clicks Done on a step he did; the dashboard appends one row and shows the step "done (Shane, unmerged)". The next session on that item ticks the box, stamped `(Shane YYYY-MM-DD)`. An ack never makes an item built.
- `.claude/state/blocked.tsv` in each repo's primary checkout, gitignored: a session stopping on Shane or Chrome appends one row through `blocked.sh`, which refuses unless git ignores the file. The row resolves on a tick, an ack, the lane landing, or the session turning busy.

## Revisit when

- An ack sits unticked over 7 days more than five times: add a writer that opens tick PRs.
- A derived status misleads Shane twice in a month where a declared line was right.
