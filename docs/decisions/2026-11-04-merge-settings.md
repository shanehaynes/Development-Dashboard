# Squash-merge only, branches up to date, linear history, auto-delete merged branches

Date: 2026-11-04 · Status: accepted

## Context

Parallel sessions and subagent fleets will open PRs here. Squash-only gives one gated commit per PR on `main` and one-commit reverts. Its cost: a merged branch is never an ancestor of `main`. The dashboard will decide landed-ness by PR state, and parallel-agents' `lane.sh tidy` already detects merges by content.

## Options

- **The new-dev-project defaults plus linear history and admins included, as on the tracker** — every merge proven against current `main` / N PRs merge as N serial rounds of update, CI, merge.
- **Drop the up-to-date rule** — no update round per PR / a PR proven only against an old `main` can break it.
- **Allow merge commits or rebase merging** — branch ancestry survives / `main` gains commits that never ran the gate alone.

## Decision

The first option:

- Squash merging only; merge commits and rebase merging off. Squash commits take the PR title and description (the skill's default), so each PR's `[ref]` reaches `main`.
- Head branches deleted automatically after merge; GitHub suggests updating a PR branch that is behind.
- `main` protected: required status check `check` (the CI job), branches up to date, linear history, no force pushes, no deletions, no required reviews (single-owner repo), enforced for admins, so Shane's own merges also wait for a green `check`.

Read back through `gh api` on 2026-11-04: the first two bullets are applied; the third is not. GitHub refuses branch protection and rulesets on this private repo on the account's current plan (HTTP 403: "Upgrade to GitHub Pro or make this repository public"). The way forward is Shane's call: GitHub Pro, a public repo (which reopens [visibility](2026-11-04-visibility.md)), or the third bullet as convention only. Until he decides, nothing on GitHub enforces it; it binds sessions as a rule, not a mechanism.

2026-11-05: Shane chose a public repository ([visibility](2026-11-05-visibility-public.md)); after the flip the third bullet was applied and read back: required check `check`, strict, linear history, force pushes and deletions blocked, zero required reviews, enforced for admins.

Held for Shane, never merged by an agent: `.github/`, `.claude/settings.json`, `.claude/skills/`, `package.json` dependencies. `LESSONS.md` changes only by curation PR.

## Revisit when

- Fleets of 10+ PRs become routine: drop the up-to-date rule only if the parallel-agents combine check runs before every batch.
- The repo moves to an organization: a merge queue replaces the serial loop, and CI gains a `merge_group` trigger.
