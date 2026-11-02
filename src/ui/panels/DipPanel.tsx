import { PARAMS, type ParamDef, type PresetParamId } from '../../midi/map';
import type { WorkingState } from '../../model/state';
import { DipSwitch } from '../DipSwitch';
import { CcNumber } from '../CcNumber';

/** The labels printed beside each dip. */
const SHORT: Partial<Record<PresetParamId, string>> = {
  dynamicsTarget: 'Dyn',
  attackTarget: 'Attack',
  eqTarget: 'EQ',
  dryTarget: 'Dry',
  wetTarget: 'Wet',
  bounce: 'Bounce',
  sweep: 'Sweep',
  polarity: 'Pol',
  miso: 'Miso',
  spread: 'Spread',
  latch: 'Latch',
  sidechain: 'Side',
  noiseGate: 'Gate',
  motion: 'Motion',
  swellAux: 'Swell Aux',
  dusty: 'Dusty',
};

const BANKS: { group: ParamDef['group']; title: string }[] = [
  { group: 'dipLeft', title: 'Ramp / Expression targets' },
  { group: 'dipRight', title: 'Customize' },
];

/** Both dip banks, left to right as on the pedal (SPEC.md §3.6, §4.5). */
export function DipPanel({ state, setParam }: { state: WorkingState; setParam(id: PresetParamId, value: number): void }) {
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
              {dips.map((p) => (
                <DipSwitch key={p.id} param={p} value={state[p.id]} short={SHORT[p.id]!} onChange={(v) => setParam(p.id, v)} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
