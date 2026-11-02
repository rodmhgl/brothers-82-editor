# Spec: Brothers 82 MIDI Editor

**Status:** Draft v1 (domain model settled, see CONTEXT.md and docs/adr/) · **Author:** Rod Stewart · **Date:** 2026-11-02
**Audience:** Claude Code (implementation agent)

---

## 0. Read this first

- **Goal:** A free, MIT-licensed editor/controller for the **Brothers 82** two-channel drive pedal, with Clean's parity feature set minus Clean's Hidden Options panel and pedal-specific extras (§1).
- **Starting point:** This is a fork of the Clean editor (`rodmhgl/clean-editor`, commit `5f5a381`), not a shared core (ADR 0001). Generic parts stay as they are. Pedal knowledge is replaced. Sections marked **Δ Clean** describe what changes from Clean's `SPEC.md`. Anything this spec doesn't mention behaves as Clean does.
- **Vocabulary:** Use the terms in `CONTEXT.md` exactly. Remove Swell, Dynamics Max, Ramping, Ramp Speed, Bounce and every other Clean term from the code, the UI and the help.
- **Communication is one-way.** The pedal only *receives* MIDI, through a ¼" TRS MIDI jack (usually via a MIDIBox). The editor keeps its own belief about the pedal's state and shows how far it trusts that belief (Sync Status, §5.2).
- **Raw controls model:** State stores the raw values the editor sends. Help text is the only thing derived from them.
- **MIDI source of truth:** No Brothers 82 MIDI manual exists. §4 is the Brothers AM MIDI manual's CC table with the Brothers 82 changes supplied by Rod Stewart. The map holds only CCs in that table. Every CC number, value mapping and default lives in one data file, `src/midi/map.ts`.
- **Hardware checks:** every assumption inherited from the Brothers AM is listed in `docs/hardware-checks.md`. They must be resolved on a real pedal before release.
- **Branding:** Don't use Chase Bliss names, logos, artwork or pedal graphics in the UI. Refer to "Brothers 82" only descriptively. Draw all UI from scratch. Don't commit the manuals (they are git-ignored).

---

## 1. Parity scope

| Feature | v1 |
| --- | --- |
| Control all pedal parameters remotely | ✅ |
| Save/recall Presets to disk | ✅ (Library, §5.6) |
| Save/recall to the pedal's memory | ✅ (Slots, §5.7) |
| Every parameter automatable | ✅ via Pass-through (§5.8) |
| Settings retained between sessions | ✅ |
| Resizable UI, installable PWA | ✅ |
| Onboard help for every parameter | ✅ |
| Undo/redo, Slot Map, Virtual Pedal, Sync Status | ✅ |

**Δ Clean, removed:**
- Hidden Options panel (the two Hidden Options sit beside the Noise Gate dip, §5.5)
- Factory Presets (they can be added later if captured from the pedal)
- Factory Reset, Alt Menu, Ramp Speed, Ramping, Swell, AUX hold and Dynamics Max: none are in the MIDI manual
- the Raw MIDI panel's CC 56 guard
- `design-sync` (`.design-sync/`, `.ds-sync/`, `ds-bundle/`)
- `scripts/csv-to-presets.mjs`

Brothers AM isn't supported. It's an 82-only editor. Anyone curious about other CCs can use the Raw MIDI panel.

---

## 2. Platform & tech stack

Unchanged from Clean: browser only (Chrome/Edge, Web MIDI), TypeScript + React + Vite, Zustand, PWA via `vite-plugin-pwa`, Library on the File System Access API with an IndexedDB fallback, Vitest + Playwright, and CI on ubicloud runners that deploys to GitHub Pages.

**Δ Clean, renames:**

| Item | Value |
| --- | --- |
| Package | `brothers-82-editor` |
| Repo | `rodmhgl/brothers-82-editor` |
| Pages URL | `rodmhgl.github.io/brothers-82-editor` |
| PWA name / short name | "Brothers 82 Editor" / "Brothers 82" |
| IndexedDB names | `brothers-82-library`, `brothers-82-session` |
| Layout persist key | `brothers-82-layout` |

Also update the Playwright `PAGES_URL`, the index.html title and the affiliation notice.

**Δ Clean, visual identity:** the same design tokens and fonts, with **amber as the default accent**. The six themes are replaced by a new set based on the Brothers AM manual's plum, pink, amber and cream. No logos or artwork.

---

## 3. Pedal model (domain knowledge)

### 3.1 Architecture

The Brothers 82 has two gain Channels. Channel 1 is the overdrive side and Channel 2 is the amp side. Effect Order sets how they combine.

### 3.2 Knobs

Gain, Volume and Tone per Channel. There are no Presence knobs, physical or hidden.

| | Left | Centre | Right |
| --- | --- | --- | --- |
| Top row | Gain 2 | Vol 2 | Gain 1 |
| Bottom row | Tone 2 | Vol 1 | Tone 1 |

### 3.3 Toggles (3-position)

| Toggle | Left (pos 1) | Middle (pos 2) | Right (pos 3) |
| --- | --- | --- | --- |
| Amp Type (Channel 2) | 800 | Plexi | Solo |
| Effect Order | 2>1: Channel 2 feeds Channel 1 | 2+1: parallel | 2<1: Channel 1 feeds Channel 2 |
| OD Type (Channel 1) | 808 | Super | RJM |

### 3.4 Footswitches

- **Channel 2 Bypass** (left) and **Channel 1 Bypass** (right) each engage their Channel. Both states are stored in a Preset.
- With the Channel's **MotoByp** dip on, its footswitch is momentary. The editor's bypass buttons always latch, whatever MotoByp is set to.
- Tapping both footswitches swaps the Channels on the pedal. It has no CC, so the editor leaves it out.

### 3.5 Hidden Options

Gate Threshold and Gate Release. They have an effect only while the Noise Gate dip is on. Both are stored per Preset.

### 3.6 Dip switches and expression

- **Left bank (Expression / CV targets):** Volume 1, Volume 2, Gain 1, Gain 2, Tone 1, Tone 2, Sweep, Polarity. There's no ramping.
- **Expression / CV:** moves the knobs whose target dips are on. **Sweep** picks the Bottom or Top half of the knob's range. **Polarity** picks Forward or Reverse. See hardware check #6 for no target dips.
- **Right bank (Customize):**
  - **Noise Gate** engages the noise gate.
  - **Clean 1** removes most of the clipping from Channel 1, making it a clean boost. Each OD Type keeps its own character and frequency response. With Effect Order at 2+1 it makes Channel 1 a clean blend.
  - **MotoByp 1 / MotoByp 2** are described in §3.4.
  - **Contour 2** inverts Channel 2's midrange response. Off, Plexi and 800 have more prominent mids and Solo is scooped. On reverses this: Solo is more pronounced and Plexi and 800 are more filtered.
  - **Presence 2** inverts Channel 2's high-frequency response. Off, Plexi and 800 have more bite and Solo is smoother. On reverses this: Solo is more aggressive and Plexi and 800 are rounder.
  - **Master** makes Vol 2 set the overall output volume at all times, even with Channel 2 bypassed. Vol 1 then has no effect unless both Channels are on, when it acts as a stack mix control whose interaction depends on Effect Order.
  - **Bank** is physical only (§3.7).
- All dip states with a CC are stored in a Preset.

### 3.7 Preset toggle and Slots

The toggle reads "left / Live / right": **Slot 2 = toggle left**, **Slot 1 = toggle right**. With the physical Bank dip on, **Slot 3 = toggle left** and **Slot 4 = toggle right**. Bank has no CC because a PC reaches any Slot directly, so a Preset doesn't store it.

---

## 4. MIDI implementation

Input only, over ¼" TRS. Default MIDI channel **2** (1–16, set in Global Settings). Knob and Hidden Option values are 0–127.

- For on/off params the pedal reads **0 = off, ≥1 = on**, and the editor sends **0 / 127**.
- For 3-position toggles the pedal reads **0 or 1 → pos 1, 2 → pos 2, ≥3 → pos 3**, and the editor sends **1 / 2 / 3**.

`ParamDef` and the `group` union are unchanged from Clean, minus any member that ends up unused.

### 4.1 Knobs

| Param | CC | Default (New) |
| --- | --- | --- |
| Gain 2 | 14 | 64 |
| Vol 2 | 15 | 64 |
| Gain 1 | 16 | 64 |
| Tone 2 | 17 | 64 |
| Vol 1 | 18 | 64 |
| Tone 1 | 19 | 64 |

### 4.2 Toggles

| Param | CC | Pos 1 | Pos 2 | Pos 3 | Default |
| --- | --- | --- | --- | --- | --- |
| Amp Type | 21 | 800 | Plexi | Solo | 2 |
| Effect Order | 22 | 2>1 | 2+1 | 2<1 | 2 |
| OD Type | 23 | 808 | Super | RJM | 2 |

### 4.3 Hidden Options

| Param | CC | Value | Default |
| --- | --- | --- | --- |
| Gate Release | 27 | 0–127 | 64 (placeholder until hardware check #3) |
| Gate Threshold | 29 | 0–127 | 64 (placeholder until hardware check #3) |

The Brothers AM manual lists these CCs as Presence 2 and Presence 1. Use the CONTEXT.md names.

### 4.4 Footswitches

| Function | CC | Value | Scope |
| --- | --- | --- | --- |
| Channel 1 Bypass | 102 | 0 bypassed / ≥1 engaged | preset (default bypassed) |
| Channel 2 Bypass | 103 | 0 bypassed / ≥1 engaged | preset (default engaged) |

### 4.5 Dip switches (0 off / ≥1 on)

CC numbers run left→right looking down at the pedal. All default to 0.

| Left bank | CC | | Right bank | CC |
| --- | --- | --- | --- | --- |
| Volume 1 | 61 | | Noise Gate | 71 |
| Volume 2 | 62 | | Clean 1 | 72 |
| Gain 1 | 63 | | MotoByp 1 | 73 |
| Gain 2 | 64 | | MotoByp 2 | 74 |
| Tone 1 | 65 | | Contour 2 | 75 |
| Tone 2 | 66 | | Presence 2 | 76 |
| Sweep (0 = B, ≥1 = T) | 67 | | Master | 77 |
| Polarity (0 = F, ≥1 = R) | 68 | | | |

### 4.6 Other

| Function | CC | Value | Scope |
| --- | --- | --- | --- |
| Expression (EOM) | 100 | 0–127 | performance |
| Save to Slot | 111 | value = Slot # (1–122) | — |

### 4.7 Program Change & Slots

- **122 Slots.** Slots 1–4 can be reached from the pedal's toggle (§3.7).
- **Recall:** PC n. An empty Slot recalls nothing. **PC 0** = Live.
- **Save:** CC 111 = n. The editor sends Send All first, then CC 111. The manual's other save path (PC while holding both footswitches) isn't usable from the editor.
- **Set pedal MIDI channel:** power up holding both footswitches. The pedal adopts the MIDI channel of the first PC it receives. The wizard is the same as Clean's.
- No SysEx, dump, clock or MIDI out/thru.

---

## 5. Features (v1)

Only the differences from Clean §5 are listed here. Everything else carries over.

### 5.1 Device connection

- **Send All order:** dips → toggles → Hidden Options → knobs → Channel Bypass (1, 2). Expression is never sent by Send All.
- **Test button:** toggles Channel 2 Bypass off and on so the user can watch the LED.

### 5.2 Sync Status

| Status | Entered when |
| --- | --- |
| **In Sync** | After Send All, or after recalling a Slot the Slot Map has an entry for |
| **Possibly Stale** | On launch or reconnect, after going Live (PC 0, including the MIDI channel wizard), and while a recalled Preset or New is being sent |
| **Unknown** | After recalling a Slot with no Slot Map entry |

**Δ Clean:** no Factory Reset rule, and no factory-Slot special case. A Slot with no Slot Map entry is Unknown whichever Slot it is.

### 5.3 Virtual Pedal

It decodes every message into a simulated state, shows the knobs, toggles, dips and both Channel LEDs, stores Slots and keeps the decoded log. Example log line: `CC 21 = 2 → Amp Type → Plexi`.

Log notes:
- "Gate Threshold/Gate Release have no effect while Noise Gate is off"
- "Clean 1: Channel 1 is now a clean boost"
- "Clean 1 with 2+1: Channel 1 is now a clean blend"
- "Master: Vol 2 now sets the overall output volume"
- "Expression: no target dips on"

No audio is modelled.

### 5.4 Main editor panel

The layout follows the pedal's geometry, not its graphics:

- **Knobs:** as in §3.2.
- **Toggles:** Amp Type · Effect Order · OD Type, each showing its position name.
- **Footswitches:** Channel 2 Bypass (left) and Channel 1 Bypass (right) as stored toggles.
- **Preset toggle strip:** "Slot 2 · Toggle Left / Live / Slot 1 · Toggle Right".
- **Performance strip:** Expression slider (CC 100) only.
- The Working State name with a modified marker.

### 5.5 Dips and Hidden Options

- **Dip panel:** a bank of 8 labelled "Expression / CV targets", and a bank of 7 labelled "Customize". Bank isn't shown; its help appears in the guides.
- **Gate Threshold and Gate Release** sit beside the Noise Gate dip, marked "no effect while Noise Gate is off", and stay editable.
- **Global Settings:** the MIDI channel only.

### 5.6 Presets and Library

- **Preset contents:** every `scope: 'preset'` param, which is all knobs, toggles, Hidden Options, dips and both Channel Bypass states.
- **Library list:** name, notes and dates, plus a short summary built from the toggles (e.g. "Plexi · Super · 2+1").
- **Files (ADR 0002):** `*.b82preset.json` with `format: "brothers-82-preset"`, and `*.b82bundle.json` with `format: "brothers-82-bundle"`. `schemaVersion` starts at 1.
- **Wrong-pedal files:** a file with any other `format` is refused, never loaded best-effort. `clean-*` and `lost-found-*` formats name their pedal in the message, as Clean does for Lost+Found.

### 5.7 Slots and Slot Map

There's a 122-Slot grid labelled Slot 1 "Toggle Right", Slot 2 "Toggle Left", Slot 3 "Bank · Toggle Left" and Slot 4 "Bank · Toggle Right". Recall, store and the Slot Map work as in Clean.

### 5.8 Pass-through

As in Clean. CCs outside §4 are forwarded but not decoded.

### 5.9 Undo/redo

Unchanged from Clean.

### 5.10 Help

- Every control has a hover card (name, CC #, value, meaning). `describeControl` gives context-aware meanings, for example:
  - Contour 2 and Presence 2 describing the effect for the current Amp Type
  - Vol 1 noting, with Master on, that it has no effect unless both Channels are on, and that it's then a stack mix control
  - Clean 1 noting the clean blend when Effect Order is 2+1
  - Gate Threshold and Gate Release noting when Noise Gate is off
  - Expression noting that it needs at least one target dip
- **Guides** (`src/help/*.md`):
  - "Getting connected", adapted from Clean, including Bank
  - "How the Channels interact": Effect Order, Clean 1, and Master as a volume and stack mix control
- All wording is original and names no manufacturer.

### 5.11 Persistence, settings and UI

Unchanged, except for the shortcuts:

| Key | Action |
| --- | --- |
| ⌘S | Save |
| ⌘Z / ⇧⌘Z | Undo / redo |
| 1 | Toggle Channel 1 Bypass |
| 2 | Toggle Channel 2 Bypass |
| ⌘E | Send All |
| ? | Help |

---

## 6. Milestones

1. **M1, fork and map:**
   - Import the Clean tree as one commit naming `5f5a381`, leaving out everything §1 removes.
   - Replace `map.ts`, and strip the Clean-only model and panels.
   - Get the Virtual Pedal and unit tests green.
   - Rename everything (§2), and write `CLAUDE.md` and `docs/agents/` for this repo.
2. **M2, panels:** main panel, dips with the two Hidden Options, performance strip, themes, help content and guides.
3. **M3, Library, Slots, Sync:** file format (ADR 0002), refusing wrong-pedal files, Slot labels, Sync rules, Pass-through, and e2e specs re-targeted to the Brothers 82.
4. **M4, hardware:** resolve every item in `docs/hardware-checks.md` on a real pedal, then release.
