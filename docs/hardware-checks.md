# Hardware checks

Pedal behaviour assumed from the Brothers AM manuals, to confirm on a real Brothers 82. All must be resolved before release (SPEC.md M4).

1. **CC map.** Does every CC in SPEC.md §4.1, §4.2, §4.4 and §4.5 control the named parameter? Do the left and right dip banks run in the listed order? **YES**
2. **Toggle values.** Do 1, 2 and 3 select positions left, middle and right on Amp Type, Effect Order and OD Type? **YES**
3. **Hidden Options.** With Noise Gate on, do CC 27 and CC 29 set Gate Release and Gate Threshold? Which way does each one run? Are they saved with a Slot? What are the pedal's defaults (the map uses 64 as a placeholder)? **CC27 and CC29 do set gate release and gate threshold, respectively. They are saved with a slot. I do not know the pedal defaults. We will continue to assume 64 as a placeholder. I do not fully understand the question on "which way does each one run"**
4. **Channel Bypass values.** The manual says off = 0 and on = 1 or more. Does on mean engaged, as SPEC.md §4.4 assumes? **YES**
5. **Save via CC 111.** Does CC 111 = n save the current state to Slot n without held footswitches? Does a later PC n recall exactly that state? **YES**
6. **Expression.** With no target dips on, what does CC 100 do? With target dips on, do Sweep and Polarity behave as in the Brothers AM manual? **NO EFFECT**
7. **Live.** Does PC 0 return the pedal to its physical controls? What happens to the Channel Bypass states? **PC 0 returns to physical controls and recalls the bypass state set by those physical controls - Example: if the physical controls have both channel bypass states engaged and you PC to a patch with 1 channel bypass state engaged, when you PC 0, both channel bypass states will engage again.**
8. **MIDI channel wizard.** Does the pedal adopt the MIDI channel of the first PC after power-up with both footswitches held? **YES**