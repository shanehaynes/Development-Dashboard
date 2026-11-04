# Backlog

Candidates, not commitments. One line each, appended at the end of its group; git union-merges this file.
Promotion adds a roadmap item with the same id; the line stays until a cleanup PR.

## Deferred with triggers

- `ui-writes` UI writes into repos, first a tick-PR writer for acks — when an ack sits unticked over 7 days more than five times.
- `emitter-hooks` Emitter hooks on Stop, PostToolUse for `mcp__claude-in-chrome__.*` and UserPromptSubmit — when a signal that leaves nothing on disk is asked for twice, or the Chrome lock is bypassed twice.
- `sse-watch` SSE or fs.watch in place of polling — when a snapshot takes over 150 ms or lag shows.
- `fetch-button` A Fetch button — when the GitHub-ahead banner shows three or more times a week on a repo with no merge babysitter.
- `resolve-ticks` `resolve-ticks.mjs` for tick-only merge conflicts — when two happen in a month.
- `retire-board-state` Retire Apex board State cells — when `status-stale` fires five times in two weeks.
- `other-repos-contract` The contract for repos beyond Apex and the tracker — when Shane asks.
- `device-actor` Separate `device` and `mac` actors — when a second machine appears, or device steps batch badly three times.
- `launchd` launchd autostart for `npm start` — when Shane forgets to start it twice in a week.
- `phone-view` Phone view, a data store and auth — when a second machine needs the board; then a private store, never a public deploy.
- `policy-verdict` A merge-policy verdict in place of the `held` label — when the label misses twice.
- `mod-pane` A Claude Code mod pane rendering `/__dash/summary` beside the transcript — no trigger set; a later tier.
- `lane-session-binding` Session binding and a ref check on claim intents in `lane.sh`, made at the parallel-agents source and re-vendored — no trigger set; v1 binds by cwd and Apex's `state/sessions`.
- `bash-guard` A Bash guard hook for the look-before-discarding rules, which are prose today — when a discard rule is broken twice.
- `vendor-stamp-path` A path-free `source:` line in the parallel-agents `VENDORED` stamp, fixed in the new-dev-project vendoring script, which also rejects the skill's quoted frontmatter name — the next re-vendor.

## Known limits accepted in v1

- `squash-title-ref` Refs in squash subjects are unreliable — subjects follow each repo's `squash_merge_commit_title` setting, so only gh is trusted; switching it to `PR_TITLE` is Shane's call.
- `cloud-sessions` Cloud and Linux sessions are seen only through their PRs — the registry and worktrees are local.
- `acks-not-git` Acks fix the screen, not git — the tick waits for the next session on that item.
- `blocked-resolution` `blocked.tsv` rows resolve on the registry's `statusUpdatedAt` — observed, undocumented behaviour.
- `held-heuristic` Held detection outside Apex is a heuristic — only Apex's merge babysitter adds the `held` label, from PR B on.
- `diff-rules-ci-only` E12, E14 and E15 run only in CI's diff step — they need `--base`.
- `apex-reverify` The O16 box conversion and board rows W7, W9, W10, W14 and O06 are unverified — the Apex adoption session re-verifies each against its file.
