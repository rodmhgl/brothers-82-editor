import { PARAMS, type PresetParamId } from '../../midi/map';
import type { WorkingState } from '../../model/state';
import { HIDDEN_OPTIONS_ID } from '../domIds';
import { Knob } from '../Knob';
import { Toggle3 } from '../Toggle3';
import { HIDDEN_BESIDE_GRID, HIDDEN_GRID } from './pedalGrid';

type Props = { state: WorkingState; setParam(id: PresetParamId, value: number): void };

/**
 * The settings reached on the pedal by holding both footswitches (SPEC.md §3.5), laid out like the main panel so each sits
 * where its host control does (SPEC.md §5.5). Ramp Speed sits beside the grid: over MIDI it is its own control, grouped
 * with them as in the MIDI map (SPEC.md §4.3).
 */
export function HiddenOptionsPanel({ state, setParam }: Props) {
  const control = (id: PresetParamId) => {
    const param = PARAMS[id];
    const onChange = (v: number) => setParam(id, v);
    return param.kind === 'continuous' ? (
      <Knob key={id} param={param} value={state[id]} size="small" onChange={onChange} />
    ) : (
      <Toggle3 key={id} param={param} value={state[id]} variant="segmented" size="small" showLegend onChange={onChange} />
    );
  };

  return (
    <section id={HIDDEN_OPTIONS_ID} className="card hidden-options-card" aria-labelledby="hidden-options-heading">
      <h2 id="hidden-options-heading" className="card-title">
        Hidden Options
      </h2>
      <div className="hidden-options-grid">
        {HIDDEN_GRID.flat().map(control)}
        <div className="hidden-options-aside">{control(HIDDEN_BESIDE_GRID)}</div>
      </div>
    </section>
  );
}
