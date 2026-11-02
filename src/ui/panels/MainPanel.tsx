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
const [KNOB_TOP, KNOB_MIDDLE, TOGGLES] = PEDAL_GRID;
const KNOB_ROWS = [KNOB_TOP, KNOB_MIDDLE];

/** The physical preset toggle, left to right: Slot 2, Live, Slot 1 (SPEC.md §3.7). */
const PRESET_TOGGLE = [2, 'live', 1] as const;

/** Counter-clockwise cuts highs, clockwise cuts lows; noon is flat. */
const EQ_SIDES = ['− Highs', '− Lows'] as const;

/** The pedal's own controls, laid out as on the pedal (SPEC.md §5.4). */
export function MainPanel({ state, setParam }: Props) {
  const name = useLibraryStore((s) => s.source.name);
  const modified = useWorkingStateModified();

  const knob = (id: (typeof KNOB_ROWS)[number][number]) => {
    const param = PARAMS[id];
    const eq = id === 'eq';
    return (
      <Knob
        key={id}
        param={param}
        value={state[id]}
        accent={eq ? 'accent' : 'ink'}
        bipolar={eq ? EQ_SIDES : undefined}
        readout={eq && state.eq === PARAMS.eq.detent ? 'flat' : undefined}
        onChange={(v) => setParam(id, v)}
      />
    );
  };

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
            {row.map(knob)}
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
          param={PARAMS.swell}
          value={state.swell}
          caption="Left footswitch"
          shortcut={FOOTSWITCH_KEYS.swell}
          onChange={(v) => setParam('swell', v)}
        />
        <Footswitch
          param={PARAMS.bypass}
          value={state.bypass}
          caption="Right footswitch"
          states={['Engaged', 'Bypassed']}
          shortcut={FOOTSWITCH_KEYS.bypass}
          onChange={(v) => setParam('bypass', v)}
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
