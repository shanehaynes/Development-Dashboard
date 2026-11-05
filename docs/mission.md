# Mission

What the development dashboard is, whom it serves, and what it will not do. [tech-stack.md](tech-stack.md) says what it is built on; [roadmap.md](roadmap.md) says what comes next. Every item and session answers to this document. Where a request, or either of those documents, conflicts with it, this document wins and the conflict is raised, not resolved quietly.

## The problem

Shane runs several repos, each worked by parallel Claude sessions. Their status is prose, written by hand in roadmaps, `**Status:**` lines and board tables, and it rots within days. A session's last write comes before its PR merges, so declared status stops at "in review". On 2026-11-03 Apex's `main` was wrong in four places: three milestones read "in review" after their PRs had merged, and one showed 0 of 5 boxes ticked though its PR had shipped.

Nothing records who a stopped step waits on: Shane, an agent in Shane's signed-in Chrome, or any agent. Two resources are scarce, and both are Shane's: his attention, and his one signed-in browser, which every repo shares and only one session can drive at a time. Finding what he owes means rereading docs. Nothing queues the browser.

## Who it is for

- **Shane**, its only human reader, on one Mac.
- **The Claude sessions in his repos**, which keep it true without writing to it. Each will keep its own repo's roadmap and feature docs true as it works and record why it stopped in that repo's gitignored state. The dashboard will read those files, uncommitted edits included (phase 4), and sessions will read it back as a short notice at start (phase 8).

## Goal

One local view, switchable per repo, that answers three questions:

1. **What is being built**: items with a live lane, a PR or a ticked step, and which session is on each.
2. **What is built**: items whose every step is ticked or dropped on `main`, with the date and PR that made them so.
3. **What rests on whom**: for work in progress, the steps only Shane can take and the steps that need his Chrome, apart from what any agent can do.

Agents keep it current without a write channel. There is no status to post: a session ticks a box in its own lane, and the next poll shows it as unmerged. Later, a lesson learned in one repo reaches sessions in every repo at start (phase 9).

Day 0 (2026-11-04) delivers the scaffold, the gate, CI, the fixture generator and these docs; none of the above exists yet. Each capability arrives with its phase in [roadmap.md](roadmap.md).

## Principles

### 1. Derive, don't declare.

Repo files hold only facts true at the commit that wrote them: items, order, steps, who a step rests on, ticks. Building, in review, merged, built, blocked and who is on it are computed from `origin/main`, live worktrees, the session registry, claims and `gh`. Only boxes on `main` make an item built. Where sources disagree, the dashboard shows drift and trusts neither.

_Test:_ Would this value be wrong a week after it was written? Then derive it.

### 2. Never write a repo.

The dashboard reads. It never commits, pushes, fetches or runs a repo's own scripts, and its git calls take no optional locks, so polling never blocks a session's commit. It writes only under `~/.devdash/`. When Shane marks a step done, that is an ack there; the next session on that item ticks the box.

_Test:_ Can polling fail a session's commit, or change a byte in any repo?

### 3. Commit nothing private.

The repo is public (Shane, 2026-11-05; private from 2026-11-03 until then) and commits only code, its own docs and curated lessons; a guard refuses commits and pushes that carry anything else. Repos are discovered at runtime. No repo list, local path, session name or registry content enters git. Lanes render synthetic fixtures, so their screenshots show no real data.

_Test:_ Does `git grep` find a home-directory path or a list of Shane's repos?

### 4. One actor per step.

Every step rests on exactly one actor: Shane (`**Shane:**`, optionally qualified decide, approve, device, account or verify), an agent in Shane's signed-in Chrome (`**Chrome:**`), or any agent (no label). Every irreversible act (submit, publish, pay, upload, accept terms) is its own Shane step. "Blocked" is never a status; it is a derived status plus an open need.

_Test:_ Can Shane act on his queue without opening a doc to learn which part of a step is his?

### 5. Every surprise becomes a mechanism.

A surprise becomes a lint rule, a hook, a script or a template change at its source, not another paragraph of rules. Sessions write lessons in their own repos; a PR promotes them into `LESSONS.md`, mechanizing each where it can. At most 15 wait unmechanized.

_Test:_ Which check would have caught it?

## When principles conflict

Principles 2 and 3 outrank completeness: a view that needs a repo write or a committed list does not ship. Principle 1 outranks a tidy screen: when a source is down the dashboard says unknown, never none, and drift stays visible.

## What it will not do

- **Host anything.** It runs on 127.0.0.1 on Shane's Mac and is never deployed.
- **Serve more than one person.** No accounts, no auth, no sharing.
- **Edit docs.** No button writes a repo; ticking is a session's job.
- **Replace GitHub.** PRs, reviews, checks and merges stay there; the dashboard links to them.
- **Read transcripts.** It reads session metadata (pid, cwd, status, file times), never conversation contents or `.key` files.
- **Become a general project-management tool.** No estimates, sprints or teams, and no assignees beyond the three actors.

## What success looks like

1. Shane opens it first each morning, before any repo doc.
2. The On you queue holds no step Shane has already done.
3. A lane's uncommitted tick shows within 5 s.

The bet fails if a derived status misleads Shane twice in a month where a declared line was right. That reopens the decision to derive.

## Amending

Only Shane amends this document. An agent proposes a change in a PR of its own, never as a side effect of other work. A roadmap item that would break a principle stops and names it.
