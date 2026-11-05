# The repository is public, with privacy guards

Date: 2026-11-05 · Status: accepted · Supersedes [2026-11-04-visibility.md](2026-11-04-visibility.md)

## Context

The private decision met a plan limit on 2026-11-04: GitHub Free refuses branch protection and rulesets on a private repository (HTTP 403), so nothing on GitHub would have enforced the required `check`, the up-to-date rule or linear history. The parallel-sessions model treats that enforcement as the boundary and client-side policy as a tripwire.

Before the flip, every commit in history was audited. One hit: the first commit's vendoring stamp carried a home-directory path to the installed skills plugin. Shane approved rewriting the two commits; `main` is now 0492c02 with the same tree and no such path.

## Options

- **GitHub Pro, stay private** — enforcement with no guard code / a paid plan for one feature.
- **Public, guarded** — enforcement, and the repo can be shared / private names, paths and session names must be kept out mechanically, and one miss is permanent.
- **Private, convention only** — nothing to pay or build / no mechanism stops a red or stale merge.

## Decision

Public, guarded (Shane, 2026-11-05). The flip and the protection were applied the same day, after the history rewrite. The guards ship in the same PR as this record: `.githooks/pre-commit` and `pre-push` through `core.hooksPath`, `scripts/privacy-guard.mjs` in `npm run check` and in CI (running the base branch's copy), with a runtime denylist that is never committed. Fixtures, snapshots and screenshots use invented names; `fixtures/shots/` is the only place for images.

The standing rule is unchanged: commit no registry of local paths; discover repos at runtime; `~/.devdash/config.json` stays outside the repo.

## Revisit when

- A private token reaches `main`: audit, rewrite if the repo is young enough to allow it, and add the missed pattern to the guard and its tests.
- Shane moves to GitHub Pro or an organization: the guards stay (a public repo is still the design), but the visibility can be revisited.
