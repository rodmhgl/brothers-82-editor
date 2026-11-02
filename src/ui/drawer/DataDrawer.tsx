import { useEditorStore } from '../../store/editorStore';
import { useLayoutStore, type DrawerTab } from '../../store/layoutStore';
import { DATA_BUTTON_ID, DATA_DRAWER_ID, drawerTabId } from '../domIds';
import { HelpTab } from '../help/HelpTab';
import { LibraryTab } from './LibraryTab';
import { MidiMonitor } from './MidiMonitor';
import { ParamTable } from './ParamTable';
import { SettingsTab } from './SettingsTab';
import { SlotsTab } from './SlotsTab';

const TABS: { id: DrawerTab; label: string }[] = [
  { id: 'params', label: 'Parameters' },
  { id: 'monitor', label: 'MIDI Monitor' },
  { id: 'slots', label: 'Slots' },
  { id: 'library', label: 'Library' },
  { id: 'help', label: 'Help' },
  { id: 'settings', label: 'Settings' },
];

/**
 * A slide-over with the parameter table, the MIDI Monitor, the Slot Map, the Library, Help and Settings. Inert while closed;
 * Escape closes it.
 */
export function DataDrawer() {
  const { drawerOpen, drawerTab, showTab, closeDrawer } = useLayoutStore();
  const working = useEditorStore((s) => s.editor.working);
  const setParam = useEditorStore((s) => s.setParam);
  const sentCount = useEditorStore((s) => s.sent.length);

  return (
    <aside
      id={DATA_DRAWER_ID}
      className={`data-drawer${drawerOpen ? ' is-open' : ''}`}
      aria-label="Data"
      inert={!drawerOpen}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        // Closing makes the drawer inert, which would drop focus to the page: hand it back to the Data button.
        closeDrawer();
        document.getElementById(DATA_BUTTON_ID)?.focus();
      }}
    >
      <div className="drawer-tabs" role="tablist" aria-label="Data">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={drawerTabId(t.id)}
            aria-selected={drawerTab === t.id}
            aria-controls="drawer-panel"
            className="drawer-tab"
            onClick={() => showTab(t.id)}
          >
            {t.label}
            {t.id === 'monitor' && sentCount > 0 && <span className="tab-badge">{sentCount}</span>}
          </button>
        ))}
        <button type="button" className="drawer-close" aria-label="Close Data drawer" onClick={closeDrawer}>
          ×
        </button>
      </div>
      <div id="drawer-panel" className="drawer-body" role="tabpanel" aria-labelledby={drawerTabId(drawerTab)}>
        {drawerTab === 'params' && <ParamTable state={working} setParam={setParam} />}
        {drawerTab === 'monitor' && <MidiMonitor />}
        {drawerTab === 'slots' && <SlotsTab />}
        {drawerTab === 'library' && <LibraryTab />}
        {drawerTab === 'help' && <HelpTab />}
        {drawerTab === 'settings' && <SettingsTab />}
      </div>
    </aside>
  );
}
