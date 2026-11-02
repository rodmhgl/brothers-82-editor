# Brothers 82 Editor

A free, open-source editor and controller for the Brothers 82 two-channel drive pedal. It runs in the browser (Chrome/Edge, via Web MIDI).

> **Not affiliated with Chase Bliss.** This is an independent project, not made, endorsed or supported by Chase Bliss. "Brothers 82" is used only to describe compatibility, and the editor uses none of their names, logos or artwork. Questions about the pedal itself go to them; questions about the editor go to this repo's issues.

## Status

In development, towards the v1 feature set in [SPEC.md](SPEC.md) §1. The repo currently holds the Clean editor under its new name, so the controls are still Clean's. Forked from the Clean editor (commit `5f5a381`, see [ADR 0001](docs/adr/0001-fork-clean-editor.md)). The domain glossary is [CONTEXT.md](CONTEXT.md). Every [hardware check](docs/hardware-checks.md) must be resolved on a real pedal before release.

## Try it

The latest build from `main` is published at <https://rodmhgl.github.io/brothers-82-editor/>. It works without a MIDI device: the built-in Virtual Pedal stands in for the hardware. Chrome and Edge offer to install it as an app (Settings → App → Install), which gives it its own window and lets it open offline.

## Browser requirements

A desktop browser with Web MIDI: **Chrome** or **Edge**. Other browsers may open the editor but lack Web MIDI or limit it, and without it only the Virtual Pedal works. The browser asks for MIDI access the first time; allow it. Saving the Library to a folder uses the File System Access API (Chrome and Edge); elsewhere the Library is kept in the browser.

## Development

Requires Node 20+.

```sh
npm install
npm run dev         # start the app on http://localhost:5173
npm run typecheck
npm test            # Vitest unit tests
npx playwright install chromium   # once
npm run e2e         # Playwright tests against the Virtual Pedal
npm run render-icons  # after editing public/icon*.svg
```

The service worker exists only in the build (`npm run build && npm run preview`), never under `npm run dev`.

## Deployment

CI (`.github/workflows/ci.yml`) publishes the browser build to GitHub Pages on every push to `main`, once the tests pass. The repository's Pages source must be set to "GitHub Actions".

## Reference manuals

No Brothers 82 MIDI manual exists; [SPEC.md](SPEC.md) §4 is the source of truth. The Brothers AM pedal manual and MIDI manual are published by Chase Bliss on their [manuals page](https://www.chasebliss.com/manuals). They are not redistributed here. For local development, put the PDFs in the repo root as `Brothers-AM_Manual_Pedal_Chase-Bliss.pdf` and `Brothers-AM_MIDI-Manual_Pedal_Chase-Bliss.pdf`, where `.gitignore` excludes them.

## License

MIT
