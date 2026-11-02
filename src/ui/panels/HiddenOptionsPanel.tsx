import { PARAMS, type PresetParamId } from '../../midi/map';
import type { WorkingState } from '../../model/state';
import { Knob } from '../Knob';
import { HIDDEN_OPTIONS } from './pedalGrid';

type Props = { state: WorkingState; setParam(id: PresetParamId, value: number): void };

/** The settings with no control on the pedal's face (SPEC.md §3.5). */
export function HiddenOptionsPanel({ state, setParam }: Props) {
  return (
    <section className="card hidden-options-card" aria-labelledby="hidden-options-heading">
      <h2 id="hidden-options-heading" className="card-title">
        Hidden Options
      </h2>
      <div className="hidden-options-grid">
        {HIDDEN_OPTIONS.map((id) => (
          <Knob key={id} param={PARAMS[id]} value={state[id]} size="small" onChange={(v) => setParam(id, v)} />
        ))}
      </div>
    </section>
  );
}
