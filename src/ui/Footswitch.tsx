import { isOn, settingLabel, switchValue, type ParamDef } from '../midi/map';
import { helpFor } from './help/ControlHelpTip';
import { CcNumber } from './CcNumber';

type Props = {
  param: ParamDef;
  value: number;
  onChange(value: number): void;
  /** Which footswitch it is, e.g. "Left footswitch". */
  caption: string;
  /** Its key, for `aria-keyshortcuts`. */
  shortcut?: string;
};

/** A Channel Bypass stored in a Preset; always latches, sends 0 / 127 and lights while engaged. */
export function Footswitch({ param, value, onChange, caption, shortcut }: Props) {
  const on = isOn(value);
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={param.label}
      aria-keyshortcuts={shortcut}
      className="footswitch"
      {...helpFor(param)}
      onClick={() => onChange(switchValue(param, !on))}
    >
      <span className="led" aria-hidden="true" />
      <span>
        <span className="footswitch-state">
          {param.label} · {settingLabel(param, value)}
        </span>
        <span className="footswitch-cc">
          {caption}
          {shortcut && ` · ${shortcut}`}
          <CcNumber> · CC {param.cc}</CcNumber>
        </span>
      </span>
    </button>
  );
}
