import { PARAMS, type ParamDef, type PresetParamId } from '../../midi/map';
import type { WorkingState } from '../../model/state';
import { DipSwitch } from '../DipSwitch';
import { CcNumber } from '../CcNumber';
import { Knob } from '../Knob';
import { HIDDEN_OPTIONS } from './pedalGrid';

/** The labels printed beside each dip. */
const SHORT: Partial<Record<PresetParamId, string>> = {
  volume1Target: 'Volume 1',
  volume2Target: 'Volume 2',
  gain1Target: 'Gain 1',
  gain2Target: 'Gain 2',
  tone1Target: 'Tone 1',
  tone2Target: 'Tone 2',
  sweep: 'Sweep',
  polarity: 'Polarity',
  noiseGate: 'Noise Gate',
  clean1: 'Clean 1',
  motoByp1: 'MotoByp 1',
  motoByp2: 'MotoByp 2',
  contour2: 'Contour 2',
  presence2: 'Presence 2',
  master: 'Master',
};

const BANKS: { group: ParamDef['group']; title: string }[] = [
  { group: 'dipLeft', title: 'Expression / CV targets' },
  { group: 'dipRight', title: 'Customize' },
];

type Props = { state: WorkingState; setParam(id: PresetParamId, value: number): void };

/** Gate Threshold and Gate Release, which sit beside the Noise Gate dip and stay editable while it's off (SPEC.md §5.5). */
function HiddenOptions({ state, setParam }: Props) {
  return (
    <div className="hidden-options" role="group" aria-label="Hidden Options">
      <div className="hidden-options-knobs">
        {HIDDEN_OPTIONS.map((id) => (
          <Knob key={id} param={PARAMS[id]} value={state[id]} size="small" onChange={(v) => setParam(id, v)} />
        ))}
      </div>
      <p className="hidden-options-note">no effect while Noise Gate is off</p>
    </div>
  );
}

/** Both dip banks, stacked to leave room for the Hidden Options, each left to right as on the pedal (SPEC.md §3.6, §4.5). */
export function DipPanel({ state, setParam }: Props) {
  return (
    <section className="card dip-card" aria-label="Dip switches">
      {BANKS.map(({ group, title }) => {
        const dips = Object.values(PARAMS).filter((p) => p.group === group) as (ParamDef & { id: PresetParamId })[];
        const ccs = `CC ${dips[0]!.cc}–${dips.at(-1)!.cc}`;
        return (
          <div key={group} className="dip-bank" role="group" aria-label={title}>
            <div className="dip-bank-title">
              {title}
              <CcNumber> · {ccs}</CcNumber>
            </div>
            <div className="dip-bank-switches">
              {dips.flatMap((p) => {
                const dip = <DipSwitch key={p.id} param={p} value={state[p.id]} short={SHORT[p.id]!} onChange={(v) => setParam(p.id, v)} />;
                return p.id === PARAMS.noiseGate.id ? [dip, <HiddenOptions key="hidden-options" state={state} setParam={setParam} />] : [dip];
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}
