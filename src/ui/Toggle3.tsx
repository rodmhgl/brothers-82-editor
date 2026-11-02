import type { ReactNode } from 'react';
import type { ParamDef } from '../midi/map';
import { helpFor } from './help/ControlHelpTip';
import { CcNumber } from './CcNumber';

type Position = { label: string; value: number };

type Props = {
  param: ParamDef;
  value: number;
  onChange(value: number): void;
  /** `list`: one row per position. `segmented`: a row of segments. */
  variant: 'list' | 'segmented';
  /** What a position shows; defaults to its label. */
  renderPosition?(position: Position): ReactNode;
  /** Its accessible name; defaults to its label. */
  positionName?(position: Position): string;
  /** Shows the legend; otherwise it is only spoken. */
  showLegend?: boolean;
  size?: 'normal' | 'small';
};

/** A 3-position toggle; sends positions 1/2/3. */
export function Toggle3({ param, value, onChange, variant, renderPosition, positionName, showLegend, size = 'normal' }: Props) {
  return (
    <fieldset className={`toggle3 toggle3-${variant} toggle3-${size}`} {...helpFor(param)}>
      <legend className={showLegend ? 'toggle3-legend' : 'sr-only'}>
        {param.label}
        {showLegend && (
          <CcNumber>
            <span className="toggle3-cc"> · CC {param.cc}</span>
          </CcNumber>
        )}
      </legend>
      <div className="toggle3-positions">
        {(param.values ?? []).map((pos) => (
          <label key={pos.value} className={value === pos.value ? 'is-active' : undefined}>
            <input
              type="radio"
              className="toggle3-input"
              name={param.id}
              value={pos.value}
              checked={value === pos.value}
              aria-label={positionName?.(pos) ?? pos.label}
              onChange={() => onChange(pos.value)}
            />
            {renderPosition?.(pos) ?? pos.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
