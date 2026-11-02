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
  /** Readout shown and spoken in place of the raw value, e.g. "flat". */
  readout?: string;
  /** Marks noon, with these labels at the two ends of the sweep. */
  bipolar?: readonly [string, string];
  size?: KnobSize;
  /** Accent knobs use the accent colour; the rest are ink. */
  accent?: 'accent' | 'ink';
};

export function Knob({ param, value, onChange, caption, readout, bipolar, size = 'large', accent = 'ink' }: Props) {
  const input = useValueDrag<HTMLDivElement>(param, value, onChange);
  const deg = ((value - param.min) / (param.max - param.min)) * SWEEP_DEG;
  const style = { '--knob-deg': `${deg}deg`, '--knob-angle': `${deg - SWEEP_DEG / 2}deg` } as CSSProperties;

  return (
    <div className={`knob knob-${size} knob-accent-${accent}`} style={style} {...helpFor(param)}>
      <div
        {...input}
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={param.label}
        aria-valuemin={param.min}
        aria-valuemax={param.max}
        aria-valuenow={value}
        aria-valuetext={readout}
      >
        {(bipolar || param.detent !== undefined) && <span className="knob-noon" aria-hidden="true" />}
        {bipolar && (
          <>
            <span className="knob-side knob-side-start" aria-hidden="true">
              {bipolar[0]}
            </span>
            <span className="knob-side knob-side-end" aria-hidden="true">
              {bipolar[1]}
            </span>
          </>
        )}
        <span className="knob-disc" aria-hidden="true">
          <span className="knob-pointer" />
        </span>
      </div>
      <div className="knob-text">
        <div className="knob-label">{caption ?? param.label}</div>
        <div className="knob-value">
          {readout ?? value}
          <CcNumber>
            <span className="knob-cc">CC {param.cc}</span>
          </CcNumber>
        </div>
      </div>
    </div>
  );
}
