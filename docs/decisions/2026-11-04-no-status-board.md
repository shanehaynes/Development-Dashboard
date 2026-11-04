# No STATUS.md; the contract roadmap is the board

Date: 2026-11-04 · Status: accepted

## Context

The new-dev-project skill scaffolds `STATUS.md`: a Workstreams table with a State column, a "Pending for" list and Known gaps. That is declared status, which this project exists to replace (see [read-only posture](2026-11-04-read-only-posture.md)). The tracker's `STATUS.md` keeps its human steps in such lists, and nothing there says whether a step waits on Shane, on his signed-in Chrome, or on any agent.

## Options

- **Keep STATUS.md beside the roadmap** — the skill's default; room for free prose / two sources that disagree within days, a hot file every session edits, and a pending list that duplicates the roadmap's Shane steps.
- **The roadmap is the board** — one source, checked by the contract lint; the dashboard dogfoods its own contract / until phase 2 (lint) and phase 3 (derivation) land, the board is a file read by hand.

## Decision

The roadmap. This repo has no `STATUS.md`. Its board is `docs/roadmap.md` in the contract grammar, one item per build phase; ideas go in `docs/backlog.md`. Human steps are labelled boxes, starting with the day-0 item's Shane boxes for the visibility decision and the merge settings. The dashboard renders its own build from phase 3.

Shane's decision of 2026-11-03 reaches past this repo:

- **The tracker** (phase 5): its Workstreams table, "Pending for Shane" and open questions become roadmap steps; `STATUS.md` keeps only known-gaps facts.
- **The new-dev-project skill:** `references/status-and-decisions.md` and `references/claude-md-template.md` change at their source to scaffold `docs/roadmap.md` and `docs/backlog.md` in the contract grammar instead of `STATUS.md` (phase 5, or a follow-up PR to the skill source).

Facts about this repo that are not work, such as what the gate and CI do not cover, go in `CLAUDE.md`.

## Revisit when

The repo needs to record something the contract cannot express.
