# Clean Editor

A free, open-source editor and controller for the Clean stereo dynamics pedal. It runs in the browser (Chrome/Edge, via Web MIDI).

> **Not affiliated with Chase Bliss.** This is an independent project, not made, endorsed or supported by Chase Bliss. "Clean" is used only to describe compatibility, and the editor uses none of their names, logos or artwork. Questions about the pedal itself go to them; questions about the editor go to this repo's issues.

## What it does

- Every control on the pedal, from the browser: knobs, toggles, footswitches and dip switches.
- The Hidden Options in one grid, without the dips or the Alt Menu.
- A Library of Presets, in a folder or in the browser, with the two Factory Presets (Factory Left and Factory Right) built in. Preset files and Bundles to share.
- Save to and recall from the pedal's Slots, with a Slot Map of what each one holds.
- Pass-through: put the editor between a DAW or controller and the pedal, and the editor follows every change it passes on.
- Undo and redo, onboard help for every control, and a Virtual Pedal that stands in for the hardware.
- Settings kept between sessions. Installable as an app that opens offline.

## Try it

The latest build from `main` is published at <https://rodmhgl.github.io/clean-editor/>. Releases are tagged; `v1` is the first. It works without a MIDI device: the built-in Virtual Pedal stands in for the hardware. Chrome and Edge offer to install it as an app (Settings → App → Install), which gives it its own window and lets it open offline.

## Browser requirements

A desktop browser with Web MIDI: **Chrome** or **Edge**. Other browsers may open the editor but lack Web MIDI or limit it, and without it only the Virtual Pedal works. The browser asks for MIDI access the first time; allow it. Saving the Library to a folder uses the File System Access API (Chrome and Edge); elsewhere the Library is kept in the browser.

## Getting connected

The pedal only listens: it takes MIDI in but sends nothing back, so the editor keeps its own picture of the pedal and the Sync Status says how far to trust it.

1. **A MIDI interface.** Any class-compliant USB MIDI interface, or a controller or synth with a MIDI out.
2. **The cable.** MIDI goes into the pedal's **MIDI/AUX** jack, a 1/4" TRS socket. From a 5-pin DIN output you need a 5-pin DIN to 1/4" TRS converter made for this kind of pedal. TRS MIDI wiring differs between devices, so if nothing arrives, suspect the cable first. The **EXP/CV** jack does not take MIDI.
3. **Pick the output** in the top bar's **MIDI output** menu and press **Test**: the pedal's LED should change and then return.
4. **Match the MIDI channel.** The pedal and the editor both start on channel 2. If you've changed the pedal's, pick the same one, or run the MIDI channel wizard to set it again.
5. **Send All**, so the pedal takes on everything in the editor. The Sync Status then reads In Sync.

The Getting connected guide in the editor's Help goes further and has a troubleshooting guide using the Virtual Pedal.

## Status

v1: the full feature set in [SPEC.md](SPEC.md) §1, with every [hardware check](docs/hardware-checks.md) confirmed on a real pedal. Forked from the [Lost+Found editor](https://github.com/rodmhgl/lost-found-editor) (commit `2b04e2d`, see [ADR 0001](docs/adr/0001-fork-lost-found-editor.md)). The domain glossary is [CONTEXT.md](CONTEXT.md).

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

The pedal manual and MIDI manual are published by Chase Bliss on their [manuals page](https://www.chasebliss.com/manuals). They are not redistributed here. For local development, put the PDFs in the repo root as `Clean_Manual_Pedal_Chase+Bliss.pdf` and `Clean_Midi+Manual_Pedal_Chase+Bliss.pdf`, where `.gitignore` excludes them.

## License

MIT
