import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FACTORY_RESET_CC } from '../../midi/map';
import { useEditorStore } from '../../store/editorStore';
import { MIDI_CHANNELS, midiChannelLabel } from '../midiChannels';

/** A modal dialog that is open while mounted. Escape or the backdrop's close request calls onClose. */
function Modal({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}

type WizardStep = 'choose' | 'power' | 'send' | 'done';

/**
 * Sets the pedal's MIDI channel (SPEC.md §4.7): powered up holding both footswitches, the pedal adopts the
 * MIDI channel of the first Program Change it receives, so the last step sends PC 0 on the chosen one.
 */
export function MidiChannelWizard({ onClose }: { onClose(): void }) {
  const current = useEditorStore((s) => s.editor.global.midiChannel);
  const onVirtualPedal = useEditorStore((s) => s.isOutputVirtual());
  const { pedalPoweredUpForMidiChannel, setPedalMidiChannel } = useEditorStore.getState();
  const [step, setStep] = useState<WizardStep>('choose');
  const [chosen, setChosen] = useState(current);

  return (
    <Modal label="Set the pedal’s MIDI channel" onClose={onClose}>
      <h2 className="modal-title">Set the pedal’s MIDI channel</h2>
      {step === 'choose' && (
        <>
          <p>Pick the MIDI channel the pedal should listen on. The editor will send on it too.</p>
          <label className="modal-field">
            MIDI channel
            <select aria-label="New MIDI channel" value={chosen} onChange={(e) => setChosen(Number(e.target.value))}>
              {MIDI_CHANNELS.map((n) => (
                <option key={n} value={n}>
                  {midiChannelLabel(n)}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-actions">
            <button type="button" className="bar-button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="bar-button is-primary" onClick={() => setStep('power')}>
              Next
            </button>
          </div>
        </>
      )}
      {step === 'power' && (
        <>
          <ol className="modal-steps">
            <li>Unplug the pedal’s power.</li>
            <li>Hold down both footswitches and plug the power back in.</li>
            <li>Let go of the footswitches.</li>
          </ol>
          <p className="modal-note">
            The pedal is now waiting for a Program Change and will take its MIDI channel.
            {onVirtualPedal && ' The Virtual Pedal simulates this when you continue.'}
          </p>
          <div className="modal-actions">
            <button type="button" className="bar-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="bar-button is-primary"
              onClick={() => {
                pedalPoweredUpForMidiChannel();
                setStep('send');
              }}
            >
              It’s powered up
            </button>
          </div>
        </>
      )}
      {step === 'send' && (
        <>
          <p>
            The editor sends Program Change 0 (Live) on {midiChannelLabel(chosen)}. The pedal takes that MIDI channel and
            stays Live, following its own knobs.
          </p>
          <div className="modal-actions">
            <button type="button" className="bar-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="bar-button is-primary"
              onClick={() => {
                setPedalMidiChannel(chosen);
                setStep('done');
              }}
            >
              Send PC 0 on {midiChannelLabel(chosen)}
            </button>
          </div>
        </>
      )}
      {step === 'done' && (
        <>
          <p role="status">
            The pedal listens on {midiChannelLabel(chosen)}, and the editor now sends on it. Send All to give the pedal the
            Working State.
          </p>
          <div className="modal-actions">
            <button type="button" className="bar-button is-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Factory Reset changes the pedal outside the Working State's undo history, so it only goes out after a confirmation. */
function FactoryResetConfirm({ onClose }: { onClose(): void }) {
  const factoryReset = useEditorStore((s) => s.factoryReset);
  return (
    <Modal label="Factory Reset" onClose={onClose}>
      <h2 className="modal-title">Factory Reset the pedal?</h2>
      <p>
        This puts the pedal’s Hidden Options back to their defaults (CC {FACTORY_RESET_CC}). Saved Slots are untouched.
        The Working State’s Hidden Options are reset too, and it can’t be undone.
      </p>
      <div className="modal-actions">
        <button type="button" className="bar-button" autoFocus onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="bar-button is-danger"
          onClick={() => {
            factoryReset();
            onClose();
          }}
        >
          Reset Hidden Options
        </button>
      </div>
    </Modal>
  );
}

/** Settings that no Preset changes: the MIDI channel, and Factory Reset (SPEC.md §5.5). */
export function GlobalSettingsPanel() {
  const midiChannel = useEditorStore((s) => s.editor.global.midiChannel);
  const [open, setOpen] = useState<'wizard' | 'reset' | null>(null);
  const close = () => setOpen(null);

  return (
    <section className="card global-card" aria-labelledby="global-heading">
      <div className="card-head">
        <h2 id="global-heading" className="card-title">
          Global Settings
        </h2>
        <span className="card-note">not saved in Presets</span>
      </div>
      <div className="global-row">
        <span className="global-label">MIDI channel</span>
        <output aria-label="MIDI channel" className="global-value">
          {midiChannelLabel(midiChannel)}
        </output>
        <button type="button" className="bar-button" onClick={() => setOpen('wizard')}>
          Set pedal’s MIDI channel…
        </button>
      </div>
      <button type="button" className="bar-button is-danger" onClick={() => setOpen('reset')}>
        Factory Reset…
      </button>
      {open === 'wizard' && <MidiChannelWizard onClose={close} />}
      {open === 'reset' && <FactoryResetConfirm onClose={close} />}
    </section>
  );
}
