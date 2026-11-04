# Development Dashboard

A local, read-only dashboard for Shane's repos: what is being built, what is built, and which open steps rest on Shane or need his signed-in Chrome. By design, status is derived from git, live worktrees, the Claude session registry and GitHub, never declared, and the dashboard never writes a repo.

Day 0 (2026-11-04): scaffold, gate, CI, docs and the fixture generator; the page is a placeholder. [docs/roadmap.md](docs/roadmap.md) says what each phase will deliver.

Run it in the primary checkout only (from phase 1 it will read real local repos):

```bash
npm ci
npm start        # http://127.0.0.1:4400
```

Develop in a lane, never in the primary checkout:

```bash
bash .claude/skills/parallel-agents/scripts/lane.sh new feat/<slug> "[<ref>] <files>"
cd .claude/worktrees/feat-<slug>
npm run dev      # this lane's port; synthetic fixtures, never real repos
npm run check    # typecheck, tests, lint, format; CI runs the same
```

The plan: [docs/mission.md](docs/mission.md) · [docs/tech-stack.md](docs/tech-stack.md) · [docs/roadmap.md](docs/roadmap.md) · [docs/backlog.md](docs/backlog.md) · [docs/decisions/](docs/decisions/). Rules for sessions: [CLAUDE.md](CLAUDE.md), [CONTRIBUTING.md](CONTRIBUTING.md). Private repository (decided 2026-11-03): it commits code, its own specs and curated lessons, never a list of Shane's repos or a local path.
