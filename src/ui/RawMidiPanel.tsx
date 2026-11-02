import { useState } from 'react';
import { controlChange, programChange } from '../midi/encode';
import { FACTORY_RESET_CC } from '../midi/map';
import { useEditorStore } from '../store/editorStore';

function byteInput(value: string, onChange: (v: string) => void, label: string) {
  return (
    <label>
      {label}
      <input type="number" min={0} max={127} required value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Sends any CC or Program Change as typed, for hardware checks (docs/hardware-checks.md). Sends show in the MIDI Monitor. */
export function RawMidiPanel() {
  const forward = useEditorStore((s) => s.forward);
  const midiChannel = useEditorStore((s) => s.editor.global.midiChannel);
  const [cc, setCc] = useState('52');
  const [value, setValue] = useState('127');
  const [program, setProgram] = useState('0');
  const [allowReset, setAllowReset] = useState(false);

  // Factory Reset resets the Live Hidden Options: refused unless explicitly allowed.
  const ccBlocked = Number(cc) === FACTORY_RESET_CC && !allowReset;

  return (
    <details className="raw-midi">
      <summary>Raw MIDI (hardware checks)</summary>
      <form
        aria-label="Send CC"
        onSubmit={(e) => {
          e.preventDefault();
          if (!ccBlocked) forward(controlChange(midiChannel, Number(cc), Number(value)));
        }}
      >
        {byteInput(cc, setCc, 'CC')}
        {byteInput(value, setValue, 'Value')}
        <button type="submit" disabled={ccBlocked}>
          Send CC
        </button>
        {Number(cc) === FACTORY_RESET_CC && (
          <label className="raw-midi-danger">
            <input type="checkbox" checked={allowReset} onChange={(e) => setAllowReset(e.target.checked)} />
            CC 56 is Factory Reset and resets the Live Hidden Options. Allow it.
          </label>
        )}
      </form>
      <form
        aria-label="Send Program Change"
        onSubmit={(e) => {
          e.preventDefault();
          forward(programChange(midiChannel, Number(program)));
        }}
      >
        {byteInput(program, setProgram, 'Program')}
        <button type="submit">Send PC</button>
        <span className="raw-midi-hint">PC 0 = Live, PC n = recall Slot n</span>
      </form>
    </details>
  );
}
