# Contributing to the Development Dashboard

Shane and several Claude sessions work in this repo at once, and from phase 1 the product will read every repo it discovers. Both facts produce the hazards below. Each section says how the work fails, then the rule. [CLAUDE.md](CLAUDE.md) holds the short form; this file holds the reasons. Only day 0 exists, so where a rule names a script or a check, the phase that delivers it is given.

## 1. The primary checkout and lanes

**How it fails.** The primary checkout is three things at once: the clone that owns `.git` and `.claude/state/`, the tree `npm start` serves to Shane on port 4400, and the parent of every lane under `.claude/worktrees/`. Edit a file there and Vite hot-reloads the half-written change into Shane's instance. Leave it dirty and the post-merge `git pull --ff-only` can refuse; Shane's instance keeps serving old code and nothing on the page says so. No other session can see the edit, so none can avoid it.

- Start every task, one-liners included: `bash .claude/skills/parallel-agents/scripts/lane.sh new <type>/<slug> "[<ref>] <files>"`. It cuts `.claude/worktrees/<type>-<slug>/` from `origin/main`, runs `npm ci` there, records your claim, and prints your port and every other session's claim. If a claim names your files, coordinate or wait.
- One worktree, one branch, one PR, one concern. A second fix gets a second lane.
- In a lane the server is `npm run dev` on that lane's port (5200–5999, strict; `lane.sh port` prints it). Never `npm start` in a lane. Never `pkill -f vite`: it kills Shane's instance too. Kill the PID listening on your own port.
- After your PR merges: `lane.sh tidy`, read what it would remove, then `lane.sh tidy --yes`. The orchestrator runs `git -C <primary> pull --ff-only` and restarts `npm start`.

## 2. The dashboard reads other repos; it never writes them

**How it fails.** From phase 1 the server will poll live worktrees every 3 s and sweep all of them (about a hundred) every 60 s, while other sessions commit in them. Plain `git status` refreshes the index and takes that worktree's `index.lock`; a session committing at that moment fails with `Unable to create '…/index.lock': File exists`, and may delete the lock to get past it. `git fetch` moves remote-tracking refs under a session that just computed a merge-base, and turns every poll into network traffic. Running a repo's own scripts executes code nobody reviewed for this use. Opening a transcript or a `.key` file reads what Shane never offered.

The rules (from phase 1, `src/core/sources/git.ts` and its allowlist test enforce the git ones):

- Child processes use `execFile` with argv arrays, never a shell string; `GIT_OPTIONAL_LOCKS=0` plus `--no-optional-locks`, `LC_ALL=C`, `TZ=UTC`; cwd is a discovered path; killed after 5 s (git) or 10 s (gh); a concurrency cap.
- git runs read-only subcommands only. A unit test holds the allowlist; adding a subcommand changes that test, which is gate-protected, so the orchestrator decides.
- The dashboard never runs `git fetch`. Its one network git read is `git ls-remote origin HEAD` every 5 min, for the "GitHub ahead" banner. `gh` lists and views; it never edits.
- Never write a file in another repo, `.git` included, and never run its scripts. Never read transcripts, `*.key` files, stop-gate dirs or the fleet ledger; transcript mtimes are stat only. From `~/.claude` read only `sessions/*.json`, and trust an entry only while its pid is alive and its `procStart` matches `ps`.
- The dashboard writes only `~/.devdash/`. The one write into `~/.claude` is phase 8's `install-hook.mjs`, which Shane runs; he applies the settings block it prints.
- Every source is isolated and total: it returns diagnostics, never throws, and keeps its last good read. One broken repo never blanks another.

## 3. The contract: declare intent, derive status

**How it fails.** On 2026-11-03 four declared statuses on Apex's `main` were wrong: three said "in review" for PRs already merged, one showed 0 of 5 boxes for shipped work. A lane's last write comes before its merge, so declared status stops at "in review". Repo files therefore hold only what is true at the commit that wrote them (items, order, steps, who a step rests on, ticks); the dashboard will derive the rest from `main`, live worktrees, claims, PRs and the session registry.

The grammar in brief. From phase 2 `contract/SKILL.md` is the authority; until then, this section and [contract v1](docs/decisions/2026-11-04-contract-v1.md).

- `docs/roadmap.md`: a bucket (`## Now`, `## Next`, `## Non-goals`) has no id. An item is a heading with a trailing code-span id, `` ## Phase 1: Live board `live-board` ``, or `###` under a bucket. Ids are kebab-case, 2–40 chars, frozen once a box is checked; renames go through `- Aliases:`. File order is priority.
- Fields: `- Depends on:`, `- Spec:`, `- Result:`, `- Aliases:`, `- Order: any`, `- Learned:`. A milestone is a heading one level below its item, `M1 — name`, with an optional `· Mac`, `· Linux` or `· HELD` badge.
- Steps are boxes: `[ ]` open, `[x]` done, `[-]` dropped; `[/]` is banned. Optional `(after YYYY-MM-DD)` and `(by YYYY-MM-DD)`. One actor per box: `**Shane:**`, `**Shane (decide|approve|device|account|verify):**`, `**Chrome:**`, or none for agent work.
- An item is built when it has a box and every box on `main` is `[x]` or `[-]`. "Blocked" is never a state: it is a derived status plus an open Shane or Chrome step.
- `docs/backlog.md`: one line per entry, ``- `id` title — why (from source)``; why and source are optional.

The seven rules, as in CLAUDE.md:

1. Claim with a ref: `bash .claude/skills/parallel-agents/scripts/lane.sh new feat/live-board "[live-board] src/core/sources/registry.ts"`; a chore with no item: `"[-] …"`.
2. Tick a box when its criterion holds, in the commit that proves it, only inside the item your claim names.
3. Only Shane can do it: `- [ ] **Shane:** <one action>` (optional qualifier: decide, approve, device, account, verify). Needs his signed-in Chrome: `- [ ] **Chrome:** <task, site>`. Agent work: no label. One actor per box; every submit, publish, payment, upload or terms acceptance is its own Shane box. Write it before you stop. Tick it only after Shane did it (he said so, or the session-start notice shows his ack), stamped `(Shane YYYY-MM-DD)`; never delete it. No lines for shipit or for questions you ask in chat.
4. Stopping on Shane: `bash contract/blocked.sh "<ref>" "<reason>"`.
5. Before driving Chrome: `bash contract/chrome-lock.sh take "<ref>"`, release when done. Held or not connected: `bash contract/blocked.sh --chrome …`, then continue with independent work.
6. End the PR title with the ref: `Registry reader [live-board]`. Write no status: no "(done …)", "in review", check-mark emoji or state tables.
7. Ideas: one line at the end of a group in `docs/backlog.md`. A lesson for every repo: `- Learned: **General:** <rule>. Because <what happened>. Mechanize: <how>.`

From phase 2, `node contract/lint.mjs` will check all of this inside `npm run check` (errors E01–E19, warnings W01–W07), and CI's diff step will add the rules that need a base (E12, E14, E15). Until then rules 4 and 5 are by hand: the Shane box plus a line in your report; one Chrome task at a time machine-wide, each cleared with the orchestrator.

## 4. Ticks and refs

**How it fails.** The dashboard will join work to items by ref: claim intent, then PR title, then branch, then the item doc the lane touches. A PR with no ref can land in Untracked, its item showing no progress. A tick inside another lane's item credits the wrong PR (W06) and puts two lanes on the same lines of `docs/roadmap.md`, which then conflict. A Shane box ticked because an agent assumed he acted shows an irreversible step as done, and since boxes on `main` alone make an item built, the error ships.

- Claim with `[ref]`: `[<id>]`, or `[<id>.M<n>]` for a milestone. A chore with no item claims `[-]`. Refs come from `node contract/lint.mjs --refs` (phase 2); until then, copy the id from the heading's code span.
- End the PR title with the same ref. A `[<id>.M<n>]` PR ticks something in that milestone, or its body says `Unticked: <reason>` (E14).
- Tick a box when its criterion holds, in the commit that proves it, inside the item your claim names and nowhere else.
- A Shane or Chrome box is ticked only after Shane confirms it was done: he said so in chat, or his ack shows in the session-start notice (Done button from phase 4, notice from phase 8). Stamp it `(Shane YYYY-MM-DD)` with the date it was done (E15). Never delete it.
- An ack shows the step as "done (Shane, unmerged)" and clears it from the queues; it never makes an item built. The tick on `main` does.

## 5. The backlog is append-only

**How it fails.** `docs/backlog.md` merges with `merge=union` (`.gitattributes`): where two branches touch the same region, git keeps both sides' lines and writes no conflict markers. Two appends at the end of a group both survive, which is the point. Union has no notion of deletion: if one branch removes an entry while another appends right next to it, the merge keeps the line from the side that still has it, and the deleted entry comes back unnoticed. A multi-line entry is worse: union can interleave the lines of two entries into one garbled block.

- One entry, one line. Append at the end of its group. Never edit or remove a line in a feature lane.
- Promotion adds a roadmap item with the same id; the backlog line stays.
- Removals happen only in a cleanup PR that touches nothing else, merged while no other open PR changes `docs/backlog.md`.
- `merge=union` applies to `docs/backlog.md` alone (E16). On code it would resurrect and interleave lines silently.

## 6. Changing `contract/`

**How it fails.** From phase 2, `contract/` is the source of the grammar, parser and lint that each adopted repo runs from a vendored copy at `.claude/skills/dev-dashboard/`; the dashboard imports the same parser directly. Change the grammar here and the dashboard reads every repo by the new rules at once, while each repo's lint still enforces the old: a file passes its own gate and renders wrong. A hand-edited vendored copy drifts from its source silently.

- A change to `contract/` bumps `contract/VERSION` in the same PR and carries a failing and a passing fixture for every rule it touches. Tags and code-span ids must survive a prettier round-trip.
- After it merges, re-vendor each adopted repo from a lane of that repo: `node scripts/vendor.mjs <that lane's worktree>` (phase 2). This is the one sanctioned write into another repo, and that PR is held there for Shane.
- Never edit a vendored copy. Its `VENDORED` stamp and that repo's CI re-vendor guard exist to refuse it.
- Until every adopted repo re-vendors, versions differ. The dashboard footer and the session-start notice (phase 8) will show contract vs vendored version; lint W07 flags a newer contract.

## 7. Fixtures, `DEVDASH_REAL` and the privacy guard

**How it fails.** A lane that points its server at Shane's real repos does two kinds of damage. It polls other sessions' worktrees from code that is unfinished by definition, and the lock discipline of section 2 is exactly what unfinished code may lack. And everything it renders (screenshots, test snapshots, a PR description) carries real repo names, session names and paths into commits and PRs, where they outlive the lane.

- `npm start` sets `DEVDASH_REAL=1`. It runs only in the primary checkout, started by the orchestrator or Shane; from phase 1 it is the one process that reads real data.
- Lanes run `npm run dev` against `fixtures/out/`: synthetic repos built by `npm run fixtures`. Until phase 1 adds the server, no server reads any data. Regenerate rather than edit; `fixtures/out/` is gitignored.
- A lane's server never writes the real `~/.devdash/`: no acks, no cache.
- Tests build real git repos in a temp dir (`tests/helpers/tmpRepo.ts`, phase 1) with `ps` and `gh` injected. No test sets `DEVDASH_REAL` or reads `~/.claude`, `~/.devdash` or a discovery root.
- Fixture names are invented. A real repo name (apex-training and assignment-tracker aside), a local path or a session name in a fixture, snapshot or screenshot is a bug.
- Not mechanized: a lane that types `npm start` is not stopped; the privacy guard below refuses the patterns it knows in what that lane would commit.

**How a leak gets out.** Agents read real paths, session names and repo names all day and write commits, PR bodies and lessons in the same breath. In a public repo a pushed commit is copied into every clone and fork, and a PR's commits stay on GitHub after its branch is deleted; a later commit that removes the text unpublishes nothing. A squash merge turns the PR title and body into the commit message on `main`.

- `scripts/privacy-guard.mjs` refuses home-directory paths, also JSON-escaped, URL-encoded and in Claude's `-Users-<name>-…` folder names; emails other than `*@example.invalid` (or `.com`, `.org`, `.net`, and their subdomains), `*@users.noreply.github.com`, `noreply@anthropic.com`, `noreply@github.com` and `git@github.com`; UUIDs outside `fixtures/` and `tests/`; GitHub owners other than shanehaynes, actions and github, in github.com, gist, raw, api and github.io links; images, video and PDFs outside `fixtures/shots/`, by extension or by content; file names with a control character or invalid UTF-8; and what it cannot read: files over 2 MB (lockfiles are read whole) and compressed archives. Other binaries are scanned as strings. `fixtures/shots/` is trusted: only text and metadata in it are checked, so a real screenshot saved there passes.
- On Shane's machine it also refuses a denylist built at run time and matched whole, ignoring case: repo names under the discovery roots, their origin slugs, private repos from `gh` (cached 24 h in `~/.devdash/cache/privacy-denylist.json`, the guard's only write) and session names. A single word counts only as a path segment. The list is never committed or printed; a hit shows its first 3 characters, inside a file name too. A name that is public after all goes in `privacyAllow` in `~/.devdash/config.json`. `DEVDASH_DENYLIST_FILE` replaces the list, for tests, and the guard says so.
- The pre-commit hook scans staged files. The pre-push hook scans every new commit's message, author, committer and files, merges included, so a hit removed by a later commit still counts; with no `origin/main` it scans the branch's whole history. It also scans tag messages and the pushed ref names. `scripts/install-githooks.sh` sets `core.hooksPath=.githooks` for all worktrees; `.claude/lane-setup.sh` runs it.
- `npm run check` ends with `--all`. CI scans each PR's commits, branch name, title and body (the squash commit's message) with the base branch's copy of the guard, so a PR cannot loosen the check that judges it, and does so even when earlier steps fail. After a merge it scans the commits pushed to `main`: that catches a message edited in the merge dialog, but cannot unpublish it.
- A hit: remove it; if it is already committed, amend or rebase before you push. `DEVDASH_ALLOW=1 git commit …` (or `git push …`) passes a hook with a notice, for a false positive only; the gate and CI ignore it, so a generic false positive gets reworded anyway.
- Not mechanized: `git commit --no-verify` and a clone without the hooks path skip the hooks; a lane runs its own copy of the guard and hooks, so only CI's base-branch copy holds against an edit to them; CI has no denylist and runs only after the push has published the branch; a pattern scan cannot judge meaning, and text split across lines or disguised beyond the forms above gets through.

## 8. Lessons

**How it fails.** A lesson learned in one repo is rediscovered in the next, because no session reads another repo. A lesson pasted raw carries its incident along: repo names, paths, a session's name, now in a file every session reads.

- Write a lesson in your own lane, where this repo keeps them: the item's `- Learned:` field. A lesson for every repo is one line: `**General:** <rule>. Because <what happened, generic>. Mechanize: <script|hook|template|none>.`
- Never write a lesson into another repo.
- From phase 9 the dashboard harvests `**General:**` lines read-only into its Lessons view and flags any seen in two repos.
- Promotion is a curation PR into `LESSONS.md`, by Shane or a session he asks: one `##` per lesson with Rule, Why (scrubbed of names and paths), Mechanism, Status (`mechanized in <skill>@<sha>` or `mechanize by <trigger>`) and stack tags. At most 15 unmechanized at once.
- Where a lesson can be code, the same promotion changes the skill source (parallel-agents, new-dev-project, `contract/SKILL.md`) and repos re-vendor. A mechanized lesson leaves the session-start digest of five stack-matched titles (phase 9).
- `LESSONS.md` changes by no other route.

## 9. Merging

**How it fails.** Two PRs each green against `main` can be red together: one tightens a rule, the other adds what it rejects. Merged in parallel, they break `main` with no PR at fault. An agent merging into a held path changes how every session works without Shane seeing it. Today nothing on GitHub stops either: branch protection is not applied.

- A lane commits, pushes its branch and reports; the orchestrator opens the PR and merges. Squash only. Every PR is based on `main`; never stack.
- Merge serially: after each merge, the next PR runs `git merge origin/main && git push` and waits for a green `check`.
- Before several PRs open at once, prove they combine: `bash .claude/skills/parallel-agents/scripts/combine-check.sh --check "npm ci && npm run check" <branch> <branch> …`. The fold proves what the command runs and nothing more.
- Held for Shane, never merged by an agent: `.github/`, `.claude/settings.json`, `.claude/skills/`, `package.json` dependencies, `docs/mission.md`. In adopted repos the vendored `dev-dashboard` copy is held too.
- Set on GitHub: squash only, squash commit from the PR title and body, branch-update suggestions, auto-delete of merged branches. Not set: branch protection (required `check`, up to date, linear history, no force pushes or deletions, admins included). GitHub refuses it on this private repo on the current plan (HTTP 403). Shane has not yet chosen: GitHub Pro, a public repo with guards, or convention only ([merge settings](docs/decisions/2026-11-04-merge-settings.md)). Until he does, the bullets above are convention, not enforcement.

## 10. What will go wrong first (predicted)

Nothing has gone wrong yet; the project is at day 0. This is the incident the rules above predict.

A lane building the registry reader wants real sessions to test against, so it runs `npm start`. Its poller calls `git status` without `--no-optional-locks`. In another repo a session runs `git commit` mid-poll and fails on `index.lock`. It follows git's advice and deletes the lock, which is safe only when no other git process holds it; one does, and two processes now write that repo's index. Meanwhile the lane screenshots its board for the PR. The image and the PR text show a private repo's name and three session names. The repo is private, so nobody objects. Then the PR text becomes a lesson, the lesson is promoted into a skill source, and the skill is vendored into a public repo.

Sections 1, 2, 7 and 8 each cut one link of that chain.
