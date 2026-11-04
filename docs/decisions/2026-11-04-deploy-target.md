# No deploy target: the dashboard runs only on Shane's machine

Date: 2026-11-04 · Status: accepted

## Context

Apart from PR state through `gh`, everything the dashboard will read is on local disk: worktrees, each primary checkout's `.claude/state/`, the Claude Code session registry, `~/.devdash/`. What it shows names local paths, sessions and private repos. A remote host would have nothing to read, and would expose whatever it showed.

## Options

- **Local only** — reads the disk directly; nothing to secure beyond the loopback interface / one machine, no phone view.
- **Static host** (GitHub Pages, as the tracker uses) — reachable anywhere / no data to build in, and publishing a snapshot publishes private state.
- **A private hosted store fed from this machine** — a phone or second machine could read it / a service, auth and a sync path, for one user on one machine.

## Decision

None. `npm start` in the primary checkout (`DEVDASH_REAL=1`, `127.0.0.1:4400`, strict port) will be the one instance that reads real data; lanes bind hashed ports and will read only synthetic fixtures. The server (phase 1) will refuse other `Host` values and send no CORS headers; `POST /__dash/ack` (phase 4) will accept only a same-origin request carrying `X-Devdash: 1`. It starts by hand; launchd autostart waits until Shane forgets to start it twice in a week.

No version endpoint: there is no deploy to verify. After a merge: `git -C <primary> pull --ff-only`, then restart `npm start`.

## Revisit when

A second machine or a phone view is wanted. Then a private store, never a public deploy.
