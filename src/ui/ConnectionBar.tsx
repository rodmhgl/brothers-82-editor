import { useEffect, useState } from 'react';
import { slotNumber, slotReach } from '../model/slots';
import { UPDATE_WAITING_HELP, useAppStore } from '../store/appStore';
import { useEditorStore } from '../store/editorStore';
import { MODIFIED_HELP, useLibraryStore, useWorkingStateModified } from '../store/library';
import { useLayoutStore } from '../store/layoutStore';
import { SYNC_STATUS_LABELS, type SyncStatus } from '../model/sync';
import { MIDI_CHANNELS, midiChannelLabel } from './midiChannels';
import { DATA_BUTTON_ID, DATA_DRAWER_ID } from './domIds';
import { StoreButton } from './StoreButton';
import { commandKeys } from './useShortcuts';

const SYNC_STATUS_HELP: Record<SyncStatus, string> = {
  inSync: 'The pedal should match the editor: everything was sent. Touching the pedal’s own controls isn’t detected.',
  possiblyStale: 'Since launch or reconnecting, the pedal may hold anything. Send All to match it.',
  unknown: 'A Slot was recalled that the editor doesn’t know. Send All to match it.',
};

/**
 * The top bar: the Working State's name, Sync Status, output, input, MIDI channel, connection indicator, Test, Send All, the
 * selected Slot, Help and the Data drawer button (SPEC.md §5.1, §5.2, §5.10).
 */
export function ConnectionBar() {
  const {
    outputs,
    outputId,
    inputs,
    inputId,
    editor: {
      global: { midiChannel },
      sync: syncStatus,
    },
    autoSendAll,
    sendingAll,
    selectedSlot,
    setOutput,
    setInput,
    setMidiChannel,
    setAutoSendAll,
    sendAll,
    test,
    connectWebMidi,
  } = useEditorStore();
  const workingStateName = useLibraryStore((s) => s.source.name);
  const modified = useWorkingStateModified();
  const drawerOpen = useLayoutStore((s) => s.drawerOpen);
  const toggleDrawer = useLayoutStore((s) => s.toggleDrawer);
  const helpOpen = useLayoutStore((s) => s.drawerOpen && s.drawerTab === 'help');
  const toggleHelp = useLayoutStore((s) => s.toggleHelp);
  // Subscribing to `outputs` above re-renders this on every hot-plug, which re-reads the connection state.
  const connected = useEditorStore.getState().isOutputConnected();
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    connectWebMidi();
  }, [connectWebMidi]);

  const selectedMissing = !outputs.some((p) => p.id === outputId);
  const inputMissing = inputId !== null && !inputs.some((p) => p.id === inputId);

  return (
    <header className="top-bar" aria-label="Connection">
      <h1 className="wordmark">
        Brothers 82<span> / Editor</span>
      </h1>
      <output className="working-state-name" aria-label="Working State" title={modified ? MODIFIED_HELP : undefined}>
        {workingStateName}
        {modified && ' •'}
      </output>
      <output className={`sync-pill is-${syncStatus}`} aria-label="Sync Status" title={SYNC_STATUS_HELP[syncStatus]}>
        {SYNC_STATUS_LABELS[syncStatus]}
      </output>
      <UpdatePill />
      <div className="connection">
        <output
          className={`connection-dot ${connected ? 'is-connected' : 'is-disconnected'}`}
          aria-label="Connection status"
          title={connected ? 'Connected' : 'Disconnected'}
        >
          <span className="sr-only">{connected ? 'Connected' : 'Disconnected'}</span>
        </output>
        <select aria-label="MIDI output" value={outputId} onChange={(e) => setOutput(e.target.value)}>
          {outputs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {selectedMissing && <option value={outputId}>(unplugged)</option>}
        </select>
        <span aria-hidden="true">·</span>
        <select
          aria-label="MIDI input"
          value={inputId ?? ''}
          title="Pass-through: messages from this input on the pedal’s MIDI channel go on to the pedal and update the editor."
          onChange={(e) => setInput(e.target.value || null)}
        >
          <option value="">No input</option>
          {inputs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          {inputMissing && <option value={inputId}>(unplugged)</option>}
        </select>
        <span aria-hidden="true">·</span>
        <select aria-label="MIDI channel" value={midiChannel} onChange={(e) => setMidiChannel(Number(e.target.value))}>
          {MIDI_CHANNELS.map((n) => (
            <option key={n} value={n}>
              {midiChannelLabel(n)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="text-button"
          disabled={!connected || testing}
          title="Flips Bypass, then puts it back, so you can see the LED change."
          onClick={async () => {
            setTesting(true);
            await test();
            setTesting(false);
          }}
        >
          Test
        </button>
        <label className="auto-send" title="Send everything whenever the output connects or reconnects.">
          <input type="checkbox" checked={autoSendAll} onChange={(e) => setAutoSendAll(e.target.checked)} />
          Send All on connect
        </label>
      </div>
      <div className="current-slot" title={`The Slot that Store writes to: ${slotReach(selectedSlot)}`}>
        {slotNumber(selectedSlot)} · {slotReach(selectedSlot)}
      </div>
      <div className="top-actions">
        <button
          type="button"
          className={`bar-button${helpOpen ? ' is-inverted' : ''}`}
          aria-expanded={helpOpen}
          aria-controls={DATA_DRAWER_ID}
          aria-keyshortcuts="?"
          title="Getting connected, and how to see any control’s help. Shortcut: ?"
          onClick={toggleHelp}
        >
          Help ?
        </button>
        <button
          id={DATA_BUTTON_ID}
          type="button"
          className={`bar-button${drawerOpen ? ' is-inverted' : ''}`}
          aria-expanded={drawerOpen}
          aria-controls={DATA_DRAWER_ID}
          onClick={toggleDrawer}
        >
          Data {drawerOpen ? '◂' : '▸'}
        </button>
        <button
          type="button"
          className="bar-button"
          disabled={!connected || sendingAll}
          aria-keyshortcuts={commandKeys('E').aria}
          title={`Sends every control in the editor to the pedal, so the two match. Shortcut: ${commandKeys('E').label}`}
          onClick={() => sendAll()}
        >
          Send All
        </button>
        <StoreButton slot={selectedSlot} label={`Store to ${slotNumber(selectedSlot)}`} className="bar-button is-primary" />
      </div>
    </header>
  );
}

/** A new version waits; it never reloads by itself, which would drop the MIDI connection mid-performance. */
function UpdatePill() {
  const updateWaiting = useAppStore((s) => s.updateWaiting);
  const reload = useAppStore((s) => s.reload);
  if (!updateWaiting) return null;
  return (
    <div className="update-pill" role="status" title={UPDATE_WAITING_HELP}>
      Update available
      <button type="button" className="text-button" onClick={reload}>
        Reload
      </button>
    </div>
  );
}

/** Shown above the console when the browser offers no Web MIDI. */
export function WebMidiNote() {
  const webMidiStatus = useEditorStore((s) => s.webMidiStatus);
  if (webMidiStatus !== 'unavailable') return null;
  return (
    <p className="connection-note" role="status">
      Web MIDI is unavailable — use Chrome or Edge and allow MIDI access. The Virtual Pedal still works.
    </p>
  );
}
