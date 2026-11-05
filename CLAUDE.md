# Development Dashboard

A local, read-only dashboard for Shane: per repo, what is being built, what is built, and which open steps rest on him or need his signed-in Chrome.
Stakes: months+ · Shane plus parallel Claude sessions · reads private local repo state, commits none · local only, never deployed — see [docs/decisions/2026-11-04-project-stakes.md](docs/decisions/2026-11-04-project-stakes.md).

**Start here:** read this file, then [docs/roadmap.md](docs/roadmap.md), the board (from phase 3 the dashboard derives its status), and [docs/backlog.md](docs/backlog.md). Specs: [docs/mission.md](docs/mission.md), [docs/tech-stack.md](docs/tech-stack.md). Decisions and their reasons: [docs/decisions/](docs/decisions/). Why each rule exists: [CONTRIBUTING.md](CONTRIBUTING.md).

Only day 0 exists: scaffold, gate, CI, these docs and the fixture generator; `src/App.tsx` is a placeholder. A roadmap item says what its phase will deliver, not what runs today.

Fable 5.1 orchestrates; every subagent and workflow agent runs model opus, effort xhigh.

## Several sessions may be running right now

More than one Claude session may work in this repo at once, and none can see another's uncommitted changes. For any subagent, workflow or fan-out, follow the [parallel-agents skill](.claude/skills/parallel-agents/SKILL.md) (a pinned copy — never edit it here; see its `VENDORED` file). A `PreToolUse` hook refuses a writing subagent whose brief has no `Lane:` line.

- **Never work in the primary checkout** (the clone that owns `.git`). It stays on `main`, clean. Start every task, including one-liners, with:
  `bash .claude/skills/parallel-agents/scripts/lane.sh new <type>/<slug> "[<ref>] <files you will touch>"`
  It prints other sessions' claims — read them before you start.
- **Look before discarding.** No `reset --hard`, `clean -f`, `checkout -- .`, `restore`, `branch -D`, `worktree remove --force`, `push --force` without reading what would be lost. Stash only with `-m "<unique tag>"`, apply by SHA, never `pop`. No hook enforces this.
- **Never copy files between branches or worktrees.** Merge instead.
- **Never kill servers by name.** Kill the PID on your own port.
- After your PR merges: `lane.sh tidy`, then `lane.sh tidy --yes`.

## Shared state

| Resource                             | Treatment                     | Mechanism                                                                                                                                                   | Notes                                                                                                                                  |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Primary checkout                     | orchestrator-owned            | `lane.sh new` for every task                                                                                                                                | on `main`, clean; runs `npm start`, the one real instance. After a merge: `git -C <primary> pull --ff-only`, restart `npm start`       |
| Working tree, `node_modules`, `dist` | partition                     | one worktree per lane; `.claude/lane-setup.sh` runs `npm ci`                                                                                                |                                                                                                                                        |
| Dev port                             | partition                     | `dev/port.ts` → `lane.sh port`; `strictPort`; `DEVDASH_PORT` overrides                                                                                      | primary 4400; lanes hashed into 5200–5999, on synthetic fixtures only                                                                  |
| `.claude/state/` in the primary      | append-only                   | `claims.tsv` by `lane.sh` (`tidy` prunes it); `blocked.tsv` by `contract/blocked.sh` (phase 2)                                                              | gitignored; never edit by hand                                                                                                         |
| `~/.devdash/`                        | dashboard-owned               | `config.json` (per machine, Shane edits it); `acks.tsv`, `cache/` (phase 4)                                                                                 | except `locks/chrome` (sessions, phase 2) and `heartbeat/` (session hooks, phase 8); lanes never write the real one                    |
| Shane's signed-in Chrome             | serialize, machine-wide       | `contract/chrome-lock.sh take\|release` (phase 2); until then, clear each task with the orchestrator                                                        | attended; one task at a time across every repo                                                                                         |
| Other repos, `~/.claude`             | external, read-only           | `execFile` argv, read-only git allowlist, `GIT_OPTIONAL_LOCKS=0` (phase 1)                                                                                  | never written, never fetched; lanes never read them. Phase 8's `install-hook.mjs` is Shane's to run                                    |
| GitHub API quota                     | external, shared              | background `gh` refresh (phase 1): open PRs 120 s, merged 5 min, terminal states cached                                                                     | one token for every session on the Mac; `gh` down reads unknown, never none                                                            |
| `fixtures/out/`                      | partition                     | gitignored; `npm run fixtures` regenerates it                                                                                                               | synthetic repos only; never hand-edited                                                                                                |
| Gate-protected paths                 | orchestrator-owned            | `tests/**`, `*.test.*`, `fixtures/generate.mjs`, `vite.config.ts`, `tsconfig*.json`, `.oxlintrc.json`, `.prettier*`, `.github/`, `.claude/`, `package.json` | a lane adds tests for its own code; anything else here only when its brief assigns it. A lane that believes a test is wrong reports it |
| `docs/roadmap.md`                    | hot file                      | tick and add steps only inside your claimed item                                                                                                            |                                                                                                                                        |
| `docs/backlog.md`                    | hot file                      | append-only, one line per entry (`merge=union`)                                                                                                             | removals only in a cleanup PR                                                                                                          |
| `CLAUDE.md`, `package-lock.json`     | hot file                      | small edits, reason in the PR                                                                                                                               | the lockfile moves only with a held dependency change                                                                                  |
| `contract/`                          | source of every vendored copy | a change bumps `contract/VERSION`; each adopted repo then re-vendors from a lane of its own                                                                 | the dashboard imports the same parser; each vendored copy is held in its repo                                                          |
| `LESSONS.md`                         | curated                       | curation PR only                                                                                                                                            | day-0 stub; harvest and cap arrive in phase 9                                                                                          |
| Decision records                     | partition                     | `docs/decisions/YYYY-MM-DD-<slug>.md`                                                                                                                       | date + slug, never a counter                                                                                                           |
| Merge, PR creation                   | orchestrator-owned            | squash-merge via PR, one at a time                                                                                                                          |                                                                                                                                        |

## Gate

```bash
npm run check   # tsc -b && vitest run && oxlint && prettier --check . — parallel-safe; every lane runs it; CI runs it
```

Phase 2 appends `&& node contract/lint.mjs`. Not in the gate: `npm start` against real data (primary only, by the orchestrator or Shane). CI does not cover: a real browser, real repos.

## Environments and secrets

No secrets, no `.env`, no database. `~/.devdash/config.json` is per machine (discovery roots, mute list): never committed, never copied into a checkout. Deploy: none, so no version endpoint; Vite binds `127.0.0.1` only.

## Privacy

The repo is private; commits still carry nothing private: no absolute local paths, session names, registry contents, or names of Shane's repos beyond apex-training and assignment-tracker (both public). Repos are discovered at runtime; no committed file lists them. Fixtures, snapshots and screenshots use invented names.

`scripts/privacy-guard.mjs` enforces this. Hooks in `.githooks/` run it on staged files before a commit and on every new commit (message and files) before a push; `scripts/install-githooks.sh` sets `core.hooksPath` once for all worktrees, and `.claude/lane-setup.sh` runs it. The gate ends with `--all`; CI scans each PR's commits, title and body. It refuses home-directory paths, emails other than `*@example.invalid`, `*@users.noreply.github.com` and `noreply@anthropic.com`, UUIDs outside `fixtures/` and `tests/`, github.com owners other than shanehaynes, actions and github, and images outside `fixtures/shots/`. Locally it also refuses a denylist built at run time from repo names under the discovery roots, their origin slugs, private repos from `gh` and session names; the list is never committed or printed, a hit shows 3 characters, and its only write is `~/.devdash/cache/privacy-denylist.json`. `DEVDASH_ALLOW=1` lets a hook pass with a notice; the gate and CI ignore it. Limits: `--no-verify` and a clone without the hooks path skip the hooks; CI has no denylist, so a bypassed private name reaches GitHub; a pattern scan cannot judge meaning.

## Merging

Squash-merge only; the squash commit takes the PR title and body. Merge serially: after each merge the next PR runs `git merge origin/main && git push` and waits for a green `check`. Every PR is based on `main` — never stack. Before opening several PRs at once, prove they combine (parallel-agents' combine check, with the gate).

Branch protection is not applied: GitHub refuses it on this private repo on the current plan (HTTP 403). Shane has not chosen yet: GitHub Pro, a public repo with guards, or convention only (the open `**Shane (decide):**` box in `day-0`; [merge settings](docs/decisions/2026-11-04-merge-settings.md)). Until he does, nothing on GitHub stops a red or stale merge; these rules bind by convention.

Held for Shane (never merged by an agent): `.github/`, `.claude/settings.json`, `.claude/skills/`, `package.json` dependencies, `docs/mission.md` (only Shane amends it).

## The development dashboard reads this repo

Status is derived, never written. Grammar: `contract/SKILL.md`; refs: `node contract/lint.mjs --refs`. Here `contract/` is the source, not a vendored copy, and it does not exist until phase 2 (`contract-core`). Until then: no lint, `blocked.sh` or `chrome-lock.sh`; take refs from the item heading's code span; stopping on Shane is the Shane box plus a line in your report; clear each Chrome task with the orchestrator first. The session-start notice in rule 3 arrives in phase 8.

1. Claim with a ref: `bash .claude/skills/parallel-agents/scripts/lane.sh new feat/live-board "[live-board] src/core/sources/registry.ts"`; a chore with no item: `"[-] …"`.
2. Tick a box when its criterion holds, in the commit that proves it, only inside the item your claim names.
3. Only Shane can do it: `- [ ] **Shane:** <one action>` (optional qualifier: decide, approve, device, account, verify). Needs his signed-in Chrome: `- [ ] **Chrome:** <task, site>`. Agent work: no label. One actor per box; every submit, publish, payment, upload or terms acceptance is its own Shane box. Write it before you stop. Tick it only after Shane did it (he said so, or the session-start notice shows his ack), stamped `(Shane YYYY-MM-DD)`; never delete it. No lines for shipit or for questions you ask in chat.
4. Stopping on Shane: `bash contract/blocked.sh "<ref>" "<reason>"`.
5. Before driving Chrome: `bash contract/chrome-lock.sh take "<ref>"`, release when done. Held or not connected: `bash contract/blocked.sh --chrome …`, then continue with independent work.
6. End the PR title with the ref: `Registry reader [live-board]`. Write no status: no "(done …)", "in review", check-mark emoji or state tables.
7. Ideas: one line at the end of a group in `docs/backlog.md`. A lesson for every repo: `- Learned: **General:** <rule>. Because <what happened>. Mechanize: <how>.`

From phase 2 the contract check runs inside `npm run check`; CI adds the diff checks (`--base`).

## When the project grows

Add these when their trigger fires, not before (from the new-dev-project skill):

| Trigger                           | Add                                                 |
| --------------------------------- | --------------------------------------------------- |
| First fan-out of ≥3 writing lanes | parallel-agents full path; combine check before PRs |
| First unattended merge            | merge policy with held paths + kill switch          |
| Fleets of 10+ PRs routine         | reconsider up-to-date rule vs fleet mode (decision) |
| A second machine or a phone view  | a private store, never a public deploy (decision)   |
| A rule broken twice               | make it a script or a hook                          |
