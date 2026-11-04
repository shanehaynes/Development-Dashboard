# Sessions get the contract from a vendored skill, an always-loaded block and a SessionStart hook

Date: 2026-11-04 · Status: accepted

## Context

Sessions in an adopted repo must follow the contract without being told each time. From a repo, a session loads only its always-loaded files: the tracker's `CLAUDE.md`; Apex's `CLAUDE.md` and its imports, `docs/workflow-essentials.md` among them. Apex never loads `CONTRIBUTING.md` into sessions. The live session registry, `~/.claude/sessions/<pid>.json`, is undocumented and can change. Claude Code's docs, checked 2026-11-03: hooks merge across user and project settings, so one user-level hook covers every repo; SessionStart takes command hooks with `session_id`, `cwd` and `source` on stdin; `statusLine` and `Notification` are documented.

## Options

- **A global `@import` from `~/.claude/CLAUDE.md`** — one line / reaches every project, scheduled tasks and other owners' repos included.
- **`~/.claude/rules/`** — same reach, same problem.
- **Emitter hooks in each target repo** (Stop, PostToolUse, UserPromptSubmit) — signals that need no disk / edits held settings in every repo and creates a second truth. Deferred until a disk-less signal is asked for twice, or the Chrome lock is bypassed twice.
- **Three channels plus a heartbeat** — each repo opts in, and nothing reaches a repo that did not / three things to keep in step.

## Decision

Three channels, plus a documented heartbeat:

1. **Vendored skill** `.claude/skills/dev-dashboard/` (grammar, parser, lint, `blocked.sh`, `chrome-lock.sh`), copied by `scripts/vendor.mjs` with a `VENDORED` stamp, held in each adopting repo, guarded in CI against hand edits.
2. **A block of at most 12 lines** in each repo's always-loaded file (tracker `CLAUDE.md`; Apex `docs/workflow-essentials.md`), pointing to the full `CONTRIBUTING.md` section "The development dashboard".
3. **A user-level, read-only SessionStart hook**: `hooks/session-start.mjs`, copied into `~/.claude/hooks/` by `scripts/install-hook.mjs`. Silent unless the session's repo has `.claude/dashboard.json` on main; skips scheduled runs; reads only the snapshot cache; at most 20 lines; under 1 s; always exits 0.
4. **Heartbeat, the fallback for the registry:** a `statusLine` command writing `~/.devdash/heartbeat/<session_id>.json` (refresh interval 30 s), and a `Notification` hook (`permission_prompt|idle_prompt|agent_needs_input`) appending to the same file. The registry stays primary while the two agree; disagreement is a source-health warning; if the registry format changes, the heartbeat takes over with no code change.

Shane approved installing both the hook and the heartbeat on 2026-11-03. Phase 8 builds them; `install-hook.mjs` prints the settings block and Shane applies it to `~/.claude/settings.json`. In Apex, channels 1 and 2 arrive in PR B (phase 7), which Shane decided on 2026-11-03 ships beside PR A as one shipit, without waiting for a replan.

## Revisit when

- Hook latency becomes noticeable.
- Claude Code documents a repo-scoped import.
