import { useState } from 'react';
import { SHORTCUTS, isMac } from '../useShortcuts';
import { GUIDES, HelpGuide } from './HelpGuide';

/** Help (SPEC.md §5.10): the keyboard shortcuts and a choice of guides. Hovering a control shows its own help. */
export function HelpTab() {
  const mac = isMac();
  const [guide, setGuide] = useState(GUIDES[0]!);
  return (
    <div className="help-tab">
      <p className="help-hint">Point at any control, or move to it with Tab, to see what it does. Press ? to open or close Help.</p>
      <h2 className="help-heading help-heading-3">Keyboard shortcuts</h2>
      <dl className="shortcut-list" aria-label="Keyboard shortcuts">
        {SHORTCUTS.map(({ keys, action }) => (
          <div key={action} className="shortcut">
            <dt>
              <kbd>{keys(mac)}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <nav className="help-guides" aria-label="Guides">
        {GUIDES.map((g) => (
          <button key={g.title} type="button" className="bar-button" aria-pressed={g === guide} onClick={() => setGuide(g)}>
            {g.title}
          </button>
        ))}
      </nav>
      <HelpGuide guide={guide} />
    </div>
  );
}
