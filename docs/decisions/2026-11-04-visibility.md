# The repository is private

Date: 2026-11-04 · Status: accepted

## Context

`shanehaynes/Development-Dashboard` was created public and empty. On 2026-11-03 `gh repo view` showed all three repos involved public: apex-training, assignment-tracker and this one. The design had assumed Apex was private. It was not, so this repo's visibility had to be chosen on its own merits.

The risk is not the code. It is what the dashboard handles: local paths, session names, the names of Shane's other repos (some private, some owned by others) and the session registry's contents.

## Options

- **Private now** — nothing to police, no guards to build or maintain / not shareable; on the account's current plan GitHub gives a private repo no branch protection or rulesets (HTTP 403 on 2026-11-04; see [merge settings](2026-11-04-merge-settings.md)).
- **Public, guarded** (a `core.hooksPath` pre-commit guard, a CI privacy scan, screenshots only from synthetic fixtures) — shareable, and branch protection works / a guard is bypassable (`--no-verify`, a lane without the hooks path), a scan matches patterns rather than meaning, and one miss is permanent in history and in forks.

## Decision

Private, decided by Shane on 2026-11-03 and flipped (`gh repo edit --visibility private`) on 2026-11-04, before the first push. `gh repo view` reports it private on 2026-11-04. The hooksPath guard, the CI privacy scan and the fixture-only-screenshot rule are dropped. Synthetic fixtures stay: lanes should not read real data anyway.

Standing rule, whatever the visibility: commit no registry of local paths. Repos will be discovered at runtime (children of the configured roots plus the working directories of live sessions); configuration lives in `~/.devdash/config.json`, outside the repo. No absolute local path, session name or other repo's name is committed; apex-training and assignment-tracker are public and may be named.

## Revisit when

Shane wants the repo public, to share it or to get branch protection without GitHub Pro. Then the guarded option is built in full before the flip, and every commit in history is audited first for absolute home paths, session names and repo names.
