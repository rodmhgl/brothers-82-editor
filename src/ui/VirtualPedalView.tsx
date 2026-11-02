import { useSyncExternalStore } from 'react';
import { PARAMS, isOn, settingLabel, type ParamDef, type ParamId } from '../midi/map';
import type { VirtualPedal } from '../midi/transport/virtual';

const params = Object.values(PARAMS) as ParamDef[];
const KNOBS = params.filter((p) => p.group === 'knob');
const TOGGLES = params.filter((p) => p.group === 'toggle');
const DIPS = params.filter((p) => p.group === 'dipLeft' || p.group === 'dipRight');
/** Each footswitch's LED: Swell on the left, Bypass on the right. */
const LEDS = [PARAMS.swell, PARAMS.bypass];

export function VirtualPedalView({ pedal }: { pedal: VirtualPedal }) {
  const { state, log } = useSyncExternalStore(pedal.subscribe, pedal.getSnapshot);
  const valueOf = (p: ParamDef) => state[p.id as ParamId];
  const dipsOn = DIPS.filter((p) => isOn(valueOf(p)));

  return (
    <section className="card virtual-pedal" aria-labelledby="virtual-pedal-heading">
      <h2 id="virtual-pedal-heading" className="card-title">
        Virtual Pedal
      </h2>
      <dl className="pedal-state">
        {KNOBS.map((p) => [
          <dt key={p.id}>{p.label}</dt>,
          <dd key={`${p.id}-value`}>
            <output aria-label={p.label}>{valueOf(p)}</output>
          </dd>,
        ])}
        {TOGGLES.map((p) => [
          <dt key={p.id}>{p.label}</dt>,
          <dd key={`${p.id}-value`}>
            <output aria-label={p.label}>{settingLabel(p, valueOf(p)) ?? valueOf(p)}</output>
          </dd>,
        ])}
        {LEDS.map((p) => {
          const lit = isOn(valueOf(p));
          return [
            <dt key={p.id}>{p.label} LED</dt>,
            <dd key={`${p.id}-value`}>
              <span className={`led${lit ? ' is-on' : ''}`} aria-hidden="true" />
              <output aria-label={`${p.label} LED`}>{lit ? 'On' : 'Off'}</output>
            </dd>,
          ];
        })}
        <dt>Dips on</dt>
        <dd>
          <output aria-label="Dips on">{dipsOn.length ? dipsOn.map((p) => p.label).join(', ') : 'None'}</output>
        </dd>
      </dl>
      <h3 className="card-title">Message log</h3>
      <ol className="message-log" role="log" aria-label="Message log">
        {log.map((entry) => (
          <li key={entry.id}>{entry.text}</li>
        ))}
      </ol>
    </section>
  );
}
