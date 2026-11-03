# Brothers 82 Editor

A free editor/controller for the Brothers 82 two-channel drive pedal. The pedal only receives MIDI, so the editor holds its own belief about what the pedal is doing.

## Pedal structure

**Channel**:
One of the pedal's two drive sides, each with its own Gain, Volume, Tone and footswitch. Channel 1 is the overdrive side and Channel 2 is the amp side.
_Avoid_: Side, half, lane. Never shorten **MIDI channel** to "channel".

**MIDI channel**:
The MIDI channel (1–16) the pedal listens on; default 2.
_Avoid_: channel (unqualified)

**Amp Type**:
The toggle choosing Channel 2's voicing: 800, Plexi or Solo.
_Avoid_: Gain 2 Type (the Brothers AM name)

**OD Type**:
The toggle choosing Channel 1's voicing: 808, Super or RJM.
_Avoid_: Gain 1 Type (the Brothers AM name)

**Effect Order**:
The toggle choosing how the two Channels are combined: 2>1 (Channel 2 feeds Channel 1), 2+1 (parallel) or 2<1 (Channel 1 feeds Channel 2).
_Avoid_: Treble Boost (the Brothers AM name)

**Contour 2**:
The dip that inverts Channel 2's midrange response. Off, Plexi and 800 have more prominent mids and Solo is scooped; on reverses this.
_Avoid_: Pres Link 1 (the Brothers AM name)

**Presence 2**:
The dip that inverts Channel 2's high-frequency response. Off, Plexi and 800 have more bite and Solo is smoother; on reverses this. The Brothers 82 has no Presence knob.
_Avoid_: Pres Link 2 (the Brothers AM name)

**Noise Gate**:
The dip that engages the pedal's noise gate.
_Avoid_: Hi Gain 1 (the Brothers AM name)

**Clean 1**:
The dip that removes most of the clipping from Channel 1, making it a clean boost. Each OD Type keeps its own character and frequency response. With Effect Order at 2+1, it makes Channel 1 a clean blend.
_Avoid_: Hi Gain 2 (the Brothers AM name)

**Hidden Options**:
Settings with no control on the pedal's face: Gate Threshold and Gate Release.
_Avoid_: Alt menu

**Gate Threshold**:
The Hidden Option setting the level below which the Noise Gate mutes the signal. A higher value makes the Noise Gate harder to open. Only has an effect while the Noise Gate dip is on.
_Avoid_: Presence 2 (the Brothers AM name for the same CC)

**Gate Release**:
The Hidden Option setting how quickly the Noise Gate re-engages. A higher value gives a slower, more gradual release; a lower value gives a faster one. Only has an effect while the Noise Gate dip is on.
_Avoid_: Presence 1 (the Brothers AM name for the same CC)

**Channel Bypass**:
Whether a Channel is engaged, set by that Channel's footswitch.
_Avoid_: On/off

**MotoByp**:
One dip per Channel that makes its footswitch momentary rather than latching: the Channel changes state only while the footswitch is held.

**Master**:
The dip that makes VOL 2 set the overall output volume at all times, even with Channel 2 bypassed. VOL 1 then has no effect unless both Channels are on, when it acts as a stack mix control whose interaction depends on Effect Order.

**Sweep**:
The dip choosing which half of a knob's range Expression moves through: Bottom or Top.

**Polarity**:
The dip choosing the direction Expression moves in: Forward or Reverse.

## Presets and pedal memory

**Preset**:
A named snapshot of pedal state kept in the editor's library: all knobs, toggles, dip switches except Bank, Hidden Options and both Channel Bypass states. Keeps its identity when renamed; Duplicate and Save As create a new Preset.
_Avoid_: Patch, program; never use for a pedal memory location

**Library**:
The user's collection of Presets, stored as Preset files in a folder the user chooses, or in the browser's storage.

**Bundle**:
A single file carrying full copies of several Presets, for sharing or backup. Holds no Slot numbers.
_Avoid_: Bank (that is the dip switch), set list

**Slot**:
One of the pedal's 122 numbered memory locations.
_Avoid_: Preset (for pedal memory)

**Bank**:
The physical dip that moves the pedal's preset toggle to Slots 3 and 4. It has no MIDI control, because a Program Change reaches any Slot directly.

**Toggle Slots**:
The Slots reachable from the pedal's physical preset toggle: Slot 1 = toggle right, Slot 2 = toggle left; with the Bank dip on, Slot 3 = toggle left, Slot 4 = toggle right.
_Avoid_: "Preset 1 / Preset 2" (the pedal's printed labels)

**Live**:
The pedal following its physical knobs rather than a stored Slot.

**Working State**:
The single pedal state the editor is currently editing and sending; may be modified relative to the Preset it was recalled from.
_Avoid_: Current preset, patch

**Editor State**:
Everything the editor believes about and controls on the pedal: the Working State, Performance Controls, Global Settings, Sync Status and Slot Map (plus the undo history of Working State edits).
_Avoid_: App state, store

**Slot Map**:
The editor's belief about what each Slot contains: a snapshot of the stored state plus a link to its source Preset. Never confirmed by the pedal.

**Global Settings**:
Pedal settings that are not part of a Preset: only the MIDI channel.

**Settings**:
The editor's own preferences. Never sent to the pedal; kept between sessions.
_Avoid_: Preferences, options; don't confuse with **Global Settings**, which the pedal holds

**Performance Controls**:
Momentary actions never stored in a Preset: only Expression.

## Sync

**Sync Status**:
How far the editor trusts that its state matches the pedal: In Sync, Possibly Stale or Unknown.

**Pass-through**:
Forwarding MIDI received from another source (e.g. a DAW) to the pedal while updating the editor's state.

**Send All**:
Transmitting the editor's full state to the pedal, making Sync Status In Sync.

**Virtual Pedal**:
A simulated pedal inside the editor that decodes sent MIDI into pedal state, used in place of real hardware.
_Avoid_: Mock pedal, emulator
