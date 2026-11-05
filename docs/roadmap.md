# Roadmap

The development dashboard's build plan: one item per phase, in priority order.
Nothing here declares status; from phase 3 the dashboard derives it from `main`, live lanes and PRs.
Grammar and agent rules: `contract/SKILL.md`, written in phase 2.

## Phase 0: Day 0 `day-0`

Repo, gate, CI, specs and the vendored parallel-agents skill, ready for parallel sessions.

- Order: any
- [x] **Shane (decide):** repo visibility: private. (Shane 2026-11-03)
- [x] **Shane (decide):** branch protection on this private repo: GitHub Pro, a public repo, or convention only. (Shane 2026-11-05)
- [x] **Shane (decide):** repo visibility: public with privacy guards, superseding private. (Shane 2026-11-05)
- [x] Vite 8, React 19 and strict TypeScript are scaffolded; `npm run check` is the gate; CI job `check` runs it on pushes to `main` and on PRs.
- [x] The parallel-agents skill is vendored with its `VENDORED` stamp; agent-guard runs as a `PreToolUse` hook; CI refuses hand edits to the copy.
- [x] `CLAUDE.md`, `docs/mission.md`, `docs/tech-stack.md`, this file and `docs/backlog.md` exist; decision records cover stakes, visibility, stack, read-only posture, no status board and contract v1.
- [x] `npm run fixtures` writes synthetic repos to the gitignored `fixtures/out/`.
- [x] Repo settings hold: squash only, head branches auto-delete, update-branch suggestions, squash title and body from the PR.
- [x] `main` requires `check` on an up-to-date branch, linear history, no force pushes or deletion, admins included.
- [x] The repository's visibility matches the visibility decision, and no committed file holds a local absolute path or a list of repos.
- [x] Privacy guards run: `.githooks/pre-commit` and `pre-push` through `core.hooksPath`, `scripts/privacy-guard.mjs --all` inside `npm run check`, and the CI range scan on PRs and pushes to `main`.
- [x] `npm run check` passes in the first commit and in a fresh lane; CI `check` passes on `main`; agent-guard refuses a writing subagent whose brief has no `Lane:` line.

## Phase 1: Live board `live-board`

Sessions, lanes and PRs across every discovered repo, read-only.

- Depends on: `day-0`
- [ ] Discovery lists the children of the configured roots plus the repos of registry cwds, deduped by `git rev-parse --git-common-dir`; every git repo is tier 0.
- [ ] The registry reader counts a session only when its pid is alive and `procStart` matches `ps`; claims parse in 4 and 7 columns.
- [ ] Background refreshers sweep worktrees every 60 s and poll `gh` for open PRs every 120 s and for merged or closed ones every 5 min; terminal PR states are cached for good.
- [ ] Lane classes (landed, live, review, parked, abandoned, stale, seat) take landed-ness from PR state first; session classes are busy, blocked, your move, awaiting merge, done and parked.
- [ ] `src/server/plugin.ts` serves `GET /__dash/summary` and `GET /__dash/repo/:id` behind a host allowlist with ETag/304; git and gh run through `execFile` under a concurrency cap and kill timeouts.
- [ ] `npm start` refuses `DEVDASH_REAL=1` outside the primary checkout; lanes read `fixtures/out/`.
- [ ] The page polls the repo every 3 s and the summary every 10 s, and shows the machine-wide strip, repo tabs switched by keys 1–9 and the bracket keys, and On you for sessions, PRs and lanes.
- [ ] On 127.0.0.1:4400, blocked, your-move, awaiting-merge and done sessions across all repos match `ps` and `gh`.
- [ ] Switching repos swaps every panel.
- [ ] The git argv allowlist test passes, and a commit loop in a polled tmp worktree never hits `index.lock`.

## Phase 2: Contract core `contract-core`

The contract as a vendorable skill in Node builtins only: grammar, parser, lint and two shell helpers.

- Depends on: `day-0`
- [ ] `contract/SKILL.md` states the grammar, the needs taxonomy and the agent rules; `contract/VERSION` reads 1.
- [ ] `contract/parse.mjs` and `parse.d.mts` parse roadmap, backlog and feature docs into items and steps, skipping fenced code and HTML comments.
- [ ] `contract/lint.mjs` implements E01–E19 and W01–W07 with `--base`, `--refs`, `--json`, `--pr-title` and `--pr-body-env`; exit 1 on errors, 0 on warnings, 64 on usage.
- [ ] `contract/blocked.sh` appends one row to the primary's `.claude/state/blocked.tsv` and refuses unless that path is gitignored; `contract/chrome-lock.sh` takes, refreshes and releases the machine-wide Chrome lock, stale after 30 min.
- [ ] `scripts/vendor.mjs` copies `contract/` into a worktree's `.claude/skills/dev-dashboard/` with a `VENDORED` stamp.
- [ ] `npm run check` ends with `node contract/lint.mjs`; CI runs the `--base` diff checks on PRs.
- [ ] Every lint rule has a failing and a passing fixture.
- [ ] A prettier round-trip keeps actor tags and code-span ids.
- [ ] `node contract/lint.mjs` reports nothing on this repo's `docs/roadmap.md` and `docs/backlog.md`.

## Phase 3: Feature view `feature-view`

Derived status and the feature panels; from here the dashboard tracks this repo's own build.

- Depends on: `live-board`, `contract-core`
- [ ] `src/core/derive.ts` applies R1–R5: all boxes closed on `main` make an item built; a ticked box, a linked live lane or a PR carrying its ref makes it building.
- [ ] Heads, `after` and `by` dates and `Order: any` follow the contract; an item's built date is the first first-parent commit where it became built.
- [ ] Merged PRs reconcile with ticks; drift shows with its `file:line`.
- [ ] The Building, Next, Planned, Scheduled, Built, Backlog and Untracked panels render from one repo snapshot.
- [ ] Tier-0 repos show inferred needs, quieter and labelled as inferred.
- [ ] The fixture repos and this repo answer the three asks: what is being built, what is built, and what each open step rests on.
- [ ] The unconverted tracker renders best-effort with inferred needs and a "no contract" badge.

## Phase 4: Live overlay `live-overlay`

Uncommitted lane edits reach the screen within 5 s; Shane's Done button closes the loop.

- Depends on: `feature-view`
- [ ] `src/core/overlay.ts` lays each live lane's box flips and added steps, taken against its merge-base, onto `main`; lanes never add, reorder or rename items.
- [ ] Link precedence applies, with `link-conflict`, `collision` and `unmapped-tick` drift.
- [ ] `blocked.tsv` rows show under On you and resolve on a tick, an ack, the lane landing, or the session turning busy.
- [ ] `POST /__dash/ack` (same origin, `X-Devdash: 1`) appends to `~/.devdash/acks.tsv`; the Done button writes through it, and unacked ticks on human boxes land in the Confirm list.
- [ ] Each repo's last snapshot is written to `~/.devdash/cache/<key>.json` by tmp and rename.
- [ ] An uncommitted tick in a tmp lane shows as unmerged within 5 s.
- [ ] A merged or closed lane never overlays; two lanes ticking one item union.
- [ ] An ack lifts its step out of On you; a later tick on `main` supersedes it.

## Phase 5: Adopt the tracker `adopt-simple`

assignment-tracker adopts the contract in one PR, simple profile.

- Depends on: `feature-view`, `contract-core`
- [ ] The tracker PR adds `.claude/dashboard.json`, `docs/backlog.md` with `merge=union`, the vendored contract with its CI diff step and re-vendor guard, and a wrapper test that runs the lint inside `npm run check` with no `package.json` edit.
- [ ] The tracker's roadmap is converted in place: every bullet a box, every phase an id, done dates moved to Result lines, its pending list and open questions a new item with labelled steps.
- [ ] Its STATUS.md keeps only known gaps; its CLAUDE.md carries the short contract block; a new CONTRIBUTING.md carries the full section.
- [ ] The new-dev-project skill's templates scaffold `docs/roadmap.md` and `docs/backlog.md` in the contract grammar instead of STATUS.md.
- [ ] Lint reports 0 errors on the tracker's `main`.
- [ ] The dashboard shows the tracker's four phases built, Fall-2 upkeep next, two items planned and seven in the backlog; each open labelled step sits in On you, the Chrome queue or Scheduled.

## Phase 6: Apex list profile `list-profile`

Apex's ROADMAP.md is read as it stands, through a list-style profile.

- Depends on: `feature-view`
- [ ] The list-style reader takes items from the Now, Next and Later entries and the automation-slot paragraph, each titled by its first bold span.
- [ ] Ids come from the profile's link rules, `@heading` lookups in linked docs and the `Item:` header index; anything unmatched stays provisional.
- [ ] Boards decide built for zero-box briefs and feed drift; improvements sections join the backlog; `validationKinds` turn unproven validation rows into labelled steps.
- [ ] Milestone cap badges render; the profile's `held` label, `AUTOMERGE_OFF` switch, claim and PR-title regexes and aliases take effect.
- [ ] Against a local profile fixture, the Apex view matches the list expected after PR A: two steps in On you, seven in the Chrome queue, four items building, Endurance next and provisional, W00–W15 and O01–O15 built from the boards.
- [ ] No file in Apex changes.

## Phase 7: Adopt Apex `adopt-list`

Apex adopts the contract: PR A carries the data and auto-merges; PR B carries the workflow changes under one grant.

- Depends on: `list-profile`, `contract-core`
- [ ] PR A adds the profile, `docs/backlog.md` with `merge=union`, labels on existing human boxes, the resubmission steps and the O16 screenshots as boxes, and ticks only where a merged PR proves them.
- [ ] In PR A, every done board row whose notes still owe a human step gets a labelled box or a one-line waiver, each re-verified against its file.
- [ ] PR B adds the vendored contract under a held path, the wrapper test, the CI step and re-vendor guard, the workflow-essentials bullet, the CONTRIBUTING section, and the MASTER.md and template wording.
- [ ] PR B makes `git-new.sh` refuse a refless intent, adds `stop-gate.sh blocked`, and has the merge babysitter add the `held` label; its body says it changes the workflow outside a replan.
- [ ] PR A and PR B are merged on Apex `main`.
- [ ] `git-new.sh` refuses an intent with no ref, and the next held Apex PR carries the `held` label.
- [ ] Lint reports 0 errors on Apex `main`, and the `--base` ratchet passed on both PRs.

## Phase 8: Session hook `session-hook`

A read-only SessionStart hook gives each session in an adopted repo the rules and its lane's state.

- Depends on: `live-overlay`
- [ ] `hooks/session-start.mjs` reads only the snapshot cache and prints at most 20 lines: contract versions, a rule digest, the lane's ref, acked steps to tick, drift in docs the lane touches, queue counts and the Chrome lock holder.
- [ ] A `statusLine` command and a `Notification` hook write `~/.devdash/heartbeat/<session_id>.json`; the registry stays primary while the two agree, and disagreement shows as a source-health warning.
- [ ] `scripts/install-hook.mjs` copies the hook to `~/.claude/hooks/` and prints the settings block; it edits no settings file.
- [ ] Stdin-fixture tests cover an adopted repo, an unmarked repo, a non-repo folder, a scheduled run and a corrupt cache.
- [ ] **Shane (account):** run `node scripts/install-hook.mjs` and apply the settings block it prints to `~/.claude/settings.json`.
- [ ] A session started in the tracker prints its ref and an acked step.
- [ ] Sessions started in an unmarked repo, a non-repo folder or a scheduled run print nothing.
- [ ] The hook finishes in under 1 s and exits 0, a corrupt cache included.

## Phase 9: Lessons `lessons`

A lesson learned in one repo reaches sessions in every other.

- Depends on: `session-hook`
- [ ] The harvester reads `General:` lesson lines from every adopted repo, read-only, into the Lessons view, and flags any seen in two repos.
- [ ] `npm run check` holds `LESSONS.md` to one section per lesson (rule, why, mechanism, status, stacks) and at most 15 unmechanized.
- [ ] The promotion PR template carries the skill-source change when a lesson can be code, so repos re-vendor.
- [ ] The hook prints at most five unmechanized, stack-matched lesson titles from `LESSONS.md` on `origin/main`.
- [ ] A lesson promoted from one repo appears at session start in another.
- [ ] A mechanized lesson drops out of the digest.

## Non-goals

- Hosting or any deploy; it binds 127.0.0.1 only.
- More than one user.
- Editing repo docs; the dashboard writes only `~/.devdash/`.
- Replacing GitHub; PRs, review and merges stay there.
- Reading session transcripts.
