import { isOn, settingLabel, type ParamDef } from '../midi/map';
import { helpFor } from './help/ControlHelpTip';

type Props = {
  param: ParamDef;
  value: number;
  onChange(value: number): void;
  /** The short printed label, e.g. "Clean 1"; Sweep and Polarity add their B/T, F/R setting. */
  short: string;
};

/** A vertical on/off dip; sends 0 / 127. On is up. */
export function DipSwitch({ param, value, onChange, short }: Props) {
  const on = isOn(value);
  const setting = settingLabel(param, value);
  const named = setting && setting !== 'On' && setting !== 'Off' ? ` ${setting}` : '';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={param.label}
      className="dip-switch"
      {...helpFor(param)}
      onClick={() => onChange(on ? param.min : param.max)}
    >
      <span className="dip-switch-track" aria-hidden="true">
        <span className="dip-switch-thumb" />
      </span>
      <span className="dip-switch-label">
        {short}
        {named}
      </span>
    </button>
  );
}
