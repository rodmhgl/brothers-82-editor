# Clean Editor

## Purpose

A full-featured software editor/controller for the Chase Bliss Clean stereo dynamics pedal, free and open source. v1 targets the parity feature set in SPEC.md §1. It is a fork of the Lost+Found editor (ADR 0001).

## References

- Clean_Midi+Manual_Pedal_Chase+Bliss.pdf - The MIDI manual and specifications for the Chase Bliss Clean pedal
- Clean_Manual_Pedal_Chase+Bliss.pdf - The manual for the Chase Bliss Clean pedal
- Clean_Quick+Start+Guide_Pedal_Chase+Bliss.pdf - The quick start guide
- SPEC.md - The project spec (Draft v1)
- CONTEXT.md - Domain glossary; use these terms exactly in code, UI and docs
- docs/adr/ - Architecture decision records
- docs/hardware-checks.md - Pedal behaviour the manuals left unclear, with what a real pedal showed (all resolved)
- /home/rodst/Repos/lost+found - The Lost+Found editor this repo was forked from (commit 2b04e2d); port generic fixes between the two by hand
- /home/rodst/Repos/papercuts.md - Global log of things that slowed down development

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues on rodmhgl/clean-editor (via `gh`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
