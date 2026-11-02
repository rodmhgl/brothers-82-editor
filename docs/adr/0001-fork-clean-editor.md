# Fork the Clean editor rather than share a core

The Brothers 82 editor starts as a copy of the Clean editor (rodmhgl/clean-editor, commit 5f5a381) with `src/midi/map.ts`, the model and the panels replaced, not as another pedal in that app nor as a consumer of an extracted shared package. Clean's ADR 0001 named a further pedal as the point to consider extracting a core, but that extraction is a project of its own and would delay this editor, so it stays a separate later piece of work. The Chroma Console editor is not a base or a precedent: it is a different manufacturer's pedal with a different format.

## Consequences

- Fixes to the generic parts (transport, Slot Map, Sync Status, Library, undo, PWA shell) must be ported by hand between the repos.
- `src/model` and `src/midi` stay free of UI dependencies, and all pedal knowledge stays behind `src/midi/map.ts`, so a shared core can still be extracted later by cutting that one seam.
