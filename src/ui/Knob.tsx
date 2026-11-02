import type { CSSProperties } from 'react';
import type { ParamDef } from '../midi/map';
import { helpFor } from './help/ControlHelpTip';
import { useValueDrag } from './useValueDrag';
import { CcNumber } from './CcNumber';

const SWEEP_DEG = 270;

/** 92 px, 84 px or 44 px. */
export type KnobSize = 'large' | 'medium' | 'small';

type Props = {
  param: ParamDef;
  value: number;
  onChange(value: number): void;
  /** Visible caption; defaults to the parameter label. */
  caption?: string;
  size?: KnobSize;
};

export function Knob({ param, value, onChange, caption, size = 'large' }: Props) {
  const input = useValueDrag<HTMLDivElement>(param, value, onChange);
  const deg = ((value - param.min) / (param.max - param.min)) * SWEEP_DEG;
  const style = { '--knob-deg': `${deg}deg`, '--knob-angle': `${deg - SWEEP_DEG / 2}deg` } as CSSProperties;

  return (
    <div className={`knob knob-${size}`} style={style} {...helpFor(param)}>
      <div
        {...input}
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={param.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
      >
        <span className="knob-disc" aria-hidden="true">
          <span className="knob-pointer" />
        </span>
      </div>
      <div className="knob-text">
        <div className="knob-label">{caption ?? param.label}</div>
        <div className="knob-value">
          {value}
          <CcNumber>
            <span className="knob-cc">CC {param.cc}</span>
          </CcNumber>
        </div>
      </div>
    </div>
  );
}
