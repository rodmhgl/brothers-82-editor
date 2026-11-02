import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { ParamDef } from '../midi/map';
import { helpFor } from './help/ControlHelpTip';
import { CcNumber } from './CcNumber';

type Props = {
  param: ParamDef;
  on: boolean;
  onChange(on: boolean): void;
};

/**
 * A momentary Performance Control (Dynamics Max): on while pressed, like holding the footswitch. Over MIDI it is a
 * level (SPEC.md §4.4), so the editor chooses press-and-hold and releases on every way a press can end.
 * Shift-click (or Shift+Enter/Space) latches it on in the editor until the next click; the pedal's Latch dip
 * plays no part (SPEC.md §5.4).
 */
export function HoldButton({ param, on, onChange }: Props) {
  const pressed = useRef(false);
  const [latched, setLatched] = useState(false);
  // Anything else that turns it off ends the latch too.
  useEffect(() => {
    if (!on) setLatched(false);
  }, [on]);

  /** A press starts a hold, latches (with Shift), or ends a latch. */
  const press = (shift: boolean) => {
    if (pressed.current) return;
    if (latched) {
      setLatched(false);
      onChange(false);
    } else if (shift) {
      setLatched(true);
      onChange(true);
    } else {
      pressed.current = true;
      onChange(true);
    }
  };
  const release = () => {
    if (!pressed.current) return;
    pressed.current = false;
    onChange(false);
  };

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    press(e.shiftKey);
  };
  const isHoldKey = (e: KeyboardEvent) => e.key === ' ' || e.key === 'Enter';

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={param.label}
      className="hold-button"
      {...helpFor(param)}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onLostPointerCapture={release}
      onKeyDown={(e) => {
        if (!isHoldKey(e)) return;
        e.preventDefault();
        if (!e.repeat) press(e.shiftKey);
      }}
      onKeyUp={(e) => isHoldKey(e) && release()}
      onBlur={release}
    >
      <span className="hold-name">{param.label}</span>
      <span className="hold-cc">
        {latched ? 'latched' : 'hold · shift-click latches'}
        <CcNumber> · CC {param.cc}</CcNumber>
      </span>
    </button>
  );
}
