# A months-long, local-only tool that reads Shane's private repo state and commits none of it

Date: 2026-11-04 · Status: accepted

## Context

The new-dev-project skill sizes day 0 from four answers. The approved build plan settled them; they are recorded here for Shane to correct. The dashboard has no data of its own: it reads the live state of Shane's other repositories.

## Options

- **Prototype, light path** — a smaller day 0 / other repos will vendor the contract and its validator and run the session hook, so a light start would be redone once they depend on it.
- **Commit what it reads** (a repo list, cached snapshots) — inspectable history / local paths, session names and private repo names in git.
- **Hosted or shared** — reachable from a phone / a remote host has nothing to read; see [deploy target](2026-11-04-deploy-target.md).

## Decision

1. **Lifespan: months and longer.** Ten build phases, and other repos will depend on its contract. Day 0 takes the full new-dev-project path: one gate (`npm run check`), CI job `check`, [merge settings](2026-11-04-merge-settings.md), this decision log.
2. **Who works on it: Shane plus parallel Claude sessions and subagent fleets.** No other humans. Fable 5.1 orchestrates the build; every subagent runs Opus 5.5 at xhigh effort. Day 0: parallel-agents vendored, its agent-guard hook refusing a writing subagent whose brief has no `Lane:` line, `.claude/lane-setup.sh` running `npm ci`, one port per checkout (primary 4400, worktrees hashed into 5200–5999).
3. **Data: private local state of Shane's repos, read and never committed.** Worktrees, claims, the Claude Code session registry, PR state through `gh`. The repo commits only code, its own specs and curated lessons. Day 0: no file lists Shane's repos (discovery will be runtime, machine config in `~/.devdash/`); only `npm start` in the primary (`DEVDASH_REAL=1`) will read real data, and lanes will read synthetic repos that `npm run fixtures` writes to the gitignored `fixtures/out/`. No secrets, no `.env`.
4. **Reach: local only.** Bound to `127.0.0.1`, never deployed. Day 0: no deploy target, no version endpoint.

## Revisit when

- Someone other than Shane wants to use it (reach and data change).
- A second machine or a phone view is wanted (a private store, never a public deploy).
- It needs a source beyond local state and `gh` (data changes).
