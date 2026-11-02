import type { ParamDef } from '../midi/map';
import { helpFor } from './help/ControlHelpTip';
import { CcNumber } from './CcNumber';

type Props = { param: ParamDef; on: boolean; onToggle(): void };

/** An on/off control that the pedal reads as a level (0 / 127), labelled with its CC. */
export function SwitchButton({ param, on, onToggle }: Props) {
  return (
    <button type="button" className="switch-button" aria-pressed={on} {...helpFor(param)} onClick={onToggle}>
      <span className="switch-label">
        {param.label}
        <CcNumber> · CC {param.cc}</CcNumber>
      </span>
      <span className="switch-state">{on ? 'On' : 'Off'}</span>
    </button>
  );
}
