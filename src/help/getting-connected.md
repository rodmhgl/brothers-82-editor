## Getting connected

The pedal only listens: it takes MIDI in but sends nothing back. The editor keeps its own picture of what the pedal is doing, and the Sync Status says how far to trust it.

### 1. A MIDI interface

Your computer needs a MIDI output. Any class-compliant USB MIDI interface works, as does a USB MIDI controller or synth with a MIDI out. Use **Chrome** or **Edge**: they are the browsers with Web MIDI. When the browser asks, allow MIDI access.

### 2. The cable

The pedal takes MIDI on a 1/4" **TRS** jack, not a 5-pin DIN socket.

- If your interface has a 5-pin DIN output, you need a converter from 5-pin DIN to 1/4" TRS made for this kind of pedal.
- If your interface already has a TRS MIDI output, a plain 1/4" TRS patch cable may work. TRS MIDI wiring is not the same on every device, so if nothing arrives, suspect the wiring first.
- The expression jack is for an expression pedal or control voltage. MIDI does not work there.

### 3. Pick the output

Choose your interface in the **MIDI output** menu on the top bar. The dot beside it shows whether the output is connected. Press **Test**: the editor flips Channel 2 Bypass and then puts it back, so the pedal's LED should change and then return.

### 4. Match the MIDI channel

Out of the box the pedal listens on MIDI channel 2, and so does the editor. If you have changed the pedal's MIDI channel, pick the same one in the top bar's **MIDI channel** menu. If you're not sure which it is, set it again: the wizard walks you through powering the pedal up while holding both footswitches, then sends it the MIDI channel you choose.

{{midi-channel-wizard}}

### 5. Send everything

Press **Send All** so the pedal takes on every control in the editor. The Sync Status then reads In Sync. Turning one of the pedal's own knobs takes over from the editor straight away, and the editor can't tell.

### 6. Slots and the Bank dip

The pedal keeps 122 Slots. The editor recalls any of them with a Program Change, and stores the Working State in one from the Slots tab. The pedal's own preset toggle reaches only a few of them: **Slot 2** to the left and **Slot 1** to the right, with Live in the middle.

The **Bank** dip on the pedal moves that toggle to **Slot 3** (left) and **Slot 4** (right). It has no MIDI control and the editor doesn't show it, because a Program Change reaches any Slot directly. It only matters for which Slots your foot can reach, so it isn't stored in a Preset. Set it by hand to suit the Slots you play from.

### Troubleshooting with the Virtual Pedal

The Virtual Pedal is a pretend pedal inside the editor. It decodes every message the editor sends, just as the real pedal would, and lists each one in its message log.

{{use-virtual-pedal}}

1. Select the Virtual Pedal as the output and move a knob. If the message log shows it, the editor is working, and the problem is between your computer and the pedal.
2. Switch back to your interface and press **Test**. No LED change usually means the cable or adapter: check the jack (MIDI, not expression) and the TRS wiring.
3. If the LED test works but knobs seem to do nothing, the MIDI channels probably differ. Run the MIDI channel wizard again.
4. If your interface is missing from the menu, unplug it and plug it back in; the menu updates when devices come and go. Check the browser hasn't blocked MIDI access for this site.
5. If the pedal seems to have its own ideas, press **Send All**. Its knobs, toggles or a Slot recall may have changed it behind the editor's back.
