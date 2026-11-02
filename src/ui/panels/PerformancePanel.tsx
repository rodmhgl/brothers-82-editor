import { PARAMS, isOn, switchValue } from '../../midi/map';
import { useEditorStore } from '../../store/editorStore';
import { helpFor } from '../help/ControlHelpTip';
import { HoldButton } from '../HoldButton';
import { SwitchButton } from '../SwitchButton';

/** Dynamics Max, Ramping and Expression: sent to the pedal, never saved in a Preset (SPEC.md §5.4). */
export function PerformancePanel() {
  const ramping = useEditorStore((s) => isOn(s.editor.performance.ramping));
  const expression = useEditorStore((s) => s.editor.performance.expression);
  const dynamicsMax = useEditorStore((s) => isOn(s.editor.performance.dynamicsMax));
  const setParam = useEditorStore((s) => s.setParam);

  return (
    <section className="card performance-card" aria-labelledby="performance-heading">
      <div className="card-head">
        <h2 id="performance-heading" className="card-title">
          Performance
        </h2>
        <span className="card-note">not saved in Presets</span>
      </div>
      <HoldButton
        param={PARAMS.dynamicsMax}
        on={dynamicsMax}
        onChange={(on) => setParam(PARAMS.dynamicsMax.id, switchValue(PARAMS.dynamicsMax, on))}
      />
      <SwitchButton param={PARAMS.ramping} on={ramping} onToggle={() => setParam(PARAMS.ramping.id, switchValue(PARAMS.ramping, !ramping))} />
      <label className="expression" {...helpFor(PARAMS.expression)}>
        <span className="expression-label">Expression</span>
        <input
          type="range"
          aria-label={PARAMS.expression.label}
          min={PARAMS.expression.min}
          max={PARAMS.expression.max}
          value={expression}
          onChange={(e) => setParam(PARAMS.expression.id, Number(e.target.value))}
        />
        <output className="expression-value">{expression}</output>
      </label>
    </section>
  );
}
