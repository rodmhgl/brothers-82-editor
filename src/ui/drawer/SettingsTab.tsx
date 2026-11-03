import { useId, type ReactNode } from 'react';
import { STORAGE_STATUS_HELP, STORAGE_STATUS_LABELS, UPDATE_WAITING_HELP, useAppStore } from '../../store/appStore';
import { useEditorStore } from '../../store/editorStore';
import { isTheme, KNOB_SENSITIVITIES, SEND_THROTTLE_RANGE, THEMES, UI_SCALE_RANGE } from '../../store/session';
import { useSettingsStore } from '../../store/settingsStore';

const UI_SCALE_STEP = 5;

type ControlProps = { id: string; 'aria-describedby': string };

/** One setting: its name labels the control `children` renders, and its help describes it. */
function Setting({ label, help, children }: { label: string; help: string; children(props: ControlProps): ReactNode }) {
  const id = useId();
  return (
    <div className="setting">
      <span className="setting-text">
        <label className="setting-label" htmlFor={id}>
          {label}
        </label>
        <span className="setting-help" id={`${id}-help`}>
          {help}
        </span>
      </span>
      {children({ id, 'aria-describedby': `${id}-help` })}
    </div>
  );
}

/** The editor's own settings (SPEC.md §5.11), kept between sessions. None of them is sent to the pedal. */
export function SettingsTab() {
  const { autoSendAll, sendThrottleMs, setAutoSendAll, setSendThrottleMs } = useEditorStore();
  const { knobSensitivity, theme, uiScale, showCcNumbers, confirmOverwrite, update } = useSettingsStore();

  return (
    <div className="settings-tab">
      <p className="help-hint">The editor remembers these, the Working State and the Slot Map until you next open it.</p>
      <Setting label="Auto Send All on connect" help="Sends everything whenever the output connects or reconnects.">
        {(props) => (
          <input {...props} type="checkbox" checked={autoSendAll} onChange={(e) => setAutoSendAll(e.target.checked)} />
        )}
      </Setting>
      <Setting label="Send throttle" help="The gap between Send All messages. Raise it if the pedal misses some.">
        {(props) => (
          <span className="setting-control">
            <input
              {...props}
              type="number"
              min={SEND_THROTTLE_RANGE.min}
              max={SEND_THROTTLE_RANGE.max}
              value={sendThrottleMs}
              onChange={(e) => {
                const ms = e.target.valueAsNumber;
                if (Number.isInteger(ms) && ms >= SEND_THROTTLE_RANGE.min && ms <= SEND_THROTTLE_RANGE.max) setSendThrottleMs(ms);
              }}
            />
            ms
          </span>
        )}
      </Setting>
      <Setting label="Knob drag sensitivity" help="How far a knob turns as you drag it. Hold ⇧ for fine adjustment.">
        {(props) => (
          <select {...props} value={knobSensitivity} onChange={(e) => update({ knobSensitivity: Number(e.target.value) })}>
            {KNOB_SENSITIVITIES.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? 'Normal' : `${n}×`}
              </option>
            ))}
          </select>
        )}
      </Setting>
      <Setting label="Theme" help="The editor’s colours, all drawn from the plum, pink, amber and cream of the pedal’s manual.">
        {(props) => (
          <select {...props} value={theme} onChange={(e) => isTheme(e.target.value) && update({ theme: e.target.value })}>
            {Object.entries(THEMES).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        )}
      </Setting>
      <Setting label="UI scale" help="On top of the layout’s own fit to the window.">
        {(props) => (
          <span className="setting-control">
            <input
              {...props}
              type="range"
              min={UI_SCALE_RANGE.min}
              max={UI_SCALE_RANGE.max}
              step={UI_SCALE_STEP}
              value={uiScale}
              onChange={(e) => update({ uiScale: e.target.valueAsNumber })}
            />
            <output className="setting-value">{uiScale}%</output>
          </span>
        )}
      </Setting>
      <Setting label="Show CC numbers" help="Labels each control with the CC that sets it.">
        {(props) => (
          <input
            {...props}
            type="checkbox"
            checked={showCcNumbers}
            onChange={(e) => update({ showCcNumbers: e.target.checked })}
          />
        )}
      </Setting>
      <Setting label="Confirm before overwrite" help="Storing to a Slot asks for a second click first.">
        {(props) => (
          <input
            {...props}
            type="checkbox"
            checked={confirmOverwrite}
            onChange={(e) => update({ confirmOverwrite: e.target.checked })}
          />
        )}
      </Setting>
      <AppSection />
    </div>
  );
}

/** The installed app: its version, whether the browser keeps its storage, Install, and Reload for a waiting update. */
function AppSection() {
  const { storage, installable, installed, updateWaiting, install, reload } = useAppStore();
  return (
    <section className="settings-section" aria-labelledby="settings-app">
      <h3 id="settings-app" className="settings-heading">
        App
      </h3>
      <Setting label="Version" help="The editor’s version, written into the Preset files it saves.">
        {(props) => (
          <output {...props} className="setting-value">
            {__APP_VERSION__}
          </output>
        )}
      </Setting>
      <Setting label="Storage" help={STORAGE_STATUS_HELP[storage]}>
        {(props) => (
          <output {...props} className="setting-value">
            {storage === 'unknown' ? '…' : STORAGE_STATUS_LABELS[storage]}
          </output>
        )}
      </Setting>
      {installable && !installed && (
        <Setting label="Install app" help="Its own window and icon, and it opens offline.">
          {(props) => (
            <button {...props} type="button" className="bar-button" onClick={() => void install()}>
              Install
            </button>
          )}
        </Setting>
      )}
      {updateWaiting && (
        <Setting label="Reload to update" help={UPDATE_WAITING_HELP}>
          {(props) => (
            <button {...props} type="button" className="bar-button" onClick={reload}>
              Reload
            </button>
          )}
        </Setting>
      )}
    </section>
  );
}
