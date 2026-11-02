import { LIVE_PROGRAM, PARAMS, type PresetParamId } from '../../midi/map';
import { slotReach } from '../../model/slots';
import type { WorkingState } from '../../model/state';
import { useEditorStore } from '../../store/editorStore';
import { MODIFIED_HELP, useLibraryStore, useWorkingStateModified } from '../../store/library';
import { Footswitch } from '../Footswitch';
import { Knob } from '../Knob';
import { Toggle3 } from '../Toggle3';
import { FOOTSWITCH_KEYS } from '../useShortcuts';
import { PEDAL_GRID } from './pedalGrid';

type Props = { state: WorkingState; setParam(id: PresetParamId, value: number): void };

/** As they sit on the pedal: two rows of knobs, then the toggles. */
const [KNOB_TOP, KNOB_BOTTOM, TOGGLES] = PEDAL_GRID;
const KNOB_ROWS = [KNOB_TOP, KNOB_BOTTOM];

/** The physical preset toggle, left to right: Slot 2, Live, Slot 1 (SPEC.md §3.7). */
const PRESET_TOGGLE = [2, 'live', 1] as const;

/** The pedal's own controls, laid out as on the pedal (SPEC.md §5.4). */
export function MainPanel({ state, setParam }: Props) {
  const name = useLibraryStore((s) => s.source.name);
  const modified = useWorkingStateModified();

  return (
    <section className="card main-panel" aria-label="Pedal">
      <div className="card-head">
        <h2 className="working-state-heading" title={modified ? MODIFIED_HELP : undefined}>
          <span className="sr-only">Working State: </span>
          {name}
          {modified && <span className="modified-marker"> •</span>}
        </h2>
        <PresetToggle />
      </div>

      <div className="main-knobs">
        {KNOB_ROWS.map((row, i) => (
          <div key={i} className="main-knob-row">
            {row.map((id) => (
              <Knob key={id} param={PARAMS[id]} value={state[id]} onChange={(v) => setParam(id, v)} />
            ))}
          </div>
        ))}
      </div>

      <div className="main-toggles">
        {TOGGLES.map((id) => (
          <Toggle3 key={id} param={PARAMS[id]} value={state[id]} variant="segmented" showLegend onChange={(v) => setParam(id, v)} />
        ))}
      </div>

      <div className="main-footswitches">
        <Footswitch
          param={PARAMS.channel2Bypass}
          value={state.channel2Bypass}
          caption="Left footswitch"
          shortcut={FOOTSWITCH_KEYS.channel2Bypass}
          onChange={(v) => setParam('channel2Bypass', v)}
        />
        <Footswitch
          param={PARAMS.channel1Bypass}
          value={state.channel1Bypass}
          caption="Right footswitch"
          shortcut={FOOTSWITCH_KEYS.channel1Bypass}
          onChange={(v) => setParam('channel1Bypass', v)}
        />
      </div>
    </section>
  );
}

/** The preset toggle: recalls a Toggle Slot, or goes Live (PC 0). */
function PresetToggle() {
  const goLive = useEditorStore((s) => s.goLive);
  const recallSlot = useLibraryStore((s) => s.recallSlot);
  return (
    <div className="preset-toggle" role="group" aria-label="Preset toggle">
      {PRESET_TOGGLE.map((position) =>
        position === 'live' ? (
          <button
            key="live"
            type="button"
            title={`The pedal follows its own knobs and toggles (PC ${LIVE_PROGRAM}). The editor can't read them.`}
            onClick={goLive}
          >
            Live
          </button>
        ) : (
          <button key={position} type="button" title={`Recall Slot ${position} (PC ${position})`} onClick={() => recallSlot(position)}>
            Slot {position} · {slotReach(position)}
          </button>
        ),
      )}
    </div>
  );
}
