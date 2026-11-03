# Brothers 82 Editor

## Purpose

A full-featured software editor/controller for the Brothers 82 two-channel drive pedal, free and open source. v1 targets the parity feature set in SPEC.md §1. It is a fork of the Clean editor (ADR 0001).

## References

- Brothers-AM_MIDI-Manual_Pedal_Chase-Bliss.pdf - The Brothers AM MIDI manual; no Brothers 82 MIDI manual exists, so SPEC.md §4 is the source of truth (git-ignored)
- Brothers-AM_Manual_Pedal_Chase-Bliss.pdf - The Brothers AM pedal manual (git-ignored)
- SPEC.md - The project spec (Draft v1)
- CONTEXT.md - Domain glossary; use these terms exactly in code, UI and docs
- docs/adr/ - Architecture decision records
- docs/hardware-checks.md - Behaviour assumed from the Brothers AM manuals, to confirm on a real Brothers 82 before release
- /home/rodst/Repos/clean - The Clean editor this repo was forked from (commit 5f5a381); port generic fixes between the two by hand
- /home/rodst/Repos/papercuts.md - Global log of things that slowed down development

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on rodmhgl/brothers-82-editor (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Parallel work in worktrees

Several agents may work issues at once, each in its own git worktree under `.claude/worktrees/` on its own branch.

- **Do not run `npm run e2e` in a worktree.** Playwright serves on fixed ports 4173/4174 and reuses any server already listening (`reuseExistingServer` outside CI), so a local run can silently test another worktree's build. Run `npm run typecheck` and `npm test` locally; CI runs e2e on the PR.
- Push the issue branch and open a PR that closes the issue; never push to `main` from a worktree.
