import type { CSSProperties } from 'react';
import { PARAMS, TARGET_DIPS, isOn, type ParamDef, type PresetParamId } from '../../midi/map';
import type { WorkingState } from '../../model/state';
import { helpFor } from '../help/ControlHelpTip';
import { useValueDrag } from '../useValueDrag';

/** Main knobs, then Hidden Options: every continuous Preset control, in MIDI map order. */
const ROWS = (Object.values(PARAMS) as ParamDef[])
  .filter((p) => p.kind === 'continuous' && p.scope === 'preset')
  .sort((a, b) => Number(a.group === 'hidden') - Number(b.group === 'hidden'))
  .map((p) => p.id as PresetParamId);

type Props = { state: WorkingState; setParam(id: PresetParamId, value: number): void };

function ValueBar({ id, state, setParam }: Props & { id: PresetParamId }) {
  const param: ParamDef = PARAMS[id];
  const value = state[id];
  const input = useValueDrag<HTMLDivElement>(param, value, (v) => setParam(id, v));
  const pct = (v: number) => `${((v - param.min) / (param.max - param.min)) * 100}%`;
  return (
    <div
      {...input}
      className="value-bar"
      role="slider"
      tabIndex={0}
      aria-label={param.label}
      aria-valuemin={param.min}
      aria-valuemax={param.max}
      aria-valuenow={value}
      {...helpFor(param)}
      style={{ '--bar-fill': pct(value) } as CSSProperties}
    >
      <span className="value-bar-fill" />
    </div>
  );
}

/** Every knob and Hidden Option as a row: layer, CC, a draggable value and its Expression / CV target dip. */
export function ParamTable({ state, setParam }: Props) {
  return (
    <table className="param-table">
      <thead>
        <tr>
          <th scope="col">Param</th>
          <th scope="col">Layer</th>
          <th scope="col">CC</th>
          <th scope="col">Value</th>
          <th scope="col" className="is-numeric">
            Val
          </th>
          <th scope="col" className="is-centered">
            Target
          </th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((id) => {
          const param = PARAMS[id];
          const dip = TARGET_DIPS[id];
          return (
            <tr key={id} className={`param-row is-${param.group}`}>
              <th scope="row">
                <span className="param-swatch" aria-hidden="true" />
                {param.label}
              </th>
              <td className="is-muted">{param.group === 'knob' ? 'main' : 'hidden'}</td>
              <td className="is-muted">{param.cc}</td>
              <td>
                <ValueBar id={id} state={state} setParam={setParam} />
              </td>
              <td className="is-numeric is-strong">{state[id]}</td>
              <td className="is-centered">
                {dip ? (
                  <input
                    type="checkbox"
                    className="target-box"
                    checked={isOn(state[dip])}
                    aria-label={PARAMS[dip].label}
                    {...helpFor(PARAMS[dip])}
                    onChange={(e) => setParam(dip, e.target.checked ? PARAMS[dip].max : PARAMS[dip].min)}
                  />
                ) : (
                  <span className="is-faint" aria-hidden="true">
                    ·
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
