import { useEffect } from 'react';
import { useEditorStore, virtualPedal } from '../store/editorStore';
import { useSettingsStore } from '../store/settingsStore';
import { ConnectionBar, WebMidiNote } from './ConnectionBar';
import { DataDrawer } from './drawer/DataDrawer';
import { ControlHelpTip } from './help/ControlHelpTip';
import { useLayoutScale } from './layoutScale';
import { DipPanel } from './panels/DipPanel';
import { GlobalSettingsPanel } from './panels/GlobalSettingsPanel';
import { HiddenOptionsPanel } from './panels/HiddenOptionsPanel';
import { MainPanel } from './panels/MainPanel';
import { PerformancePanel } from './panels/PerformancePanel';
import { SlotRail } from './SlotRail';
import { useShortcuts } from './useShortcuts';
import { VirtualPedalView } from './VirtualPedalView';

/** The console: the pedal's controls as on the pedal, then the dips, Global Settings and the Virtual Pedal (SPEC.md §5.4). */
export function App() {
  const working = useEditorStore((s) => s.editor.working);
  const setParam = useEditorStore((s) => s.setParam);
  const theme = useSettingsStore((s) => s.theme);
  useShortcuts();
  useLayoutScale();
  // app.css themes the page from this.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // The browser's title bar follows the theme's paper.
    const paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', paper);
  }, [theme]);

  return (
    <div className="app">
      <ConnectionBar />
      <div className="workspace">
        <SlotRail />
        <main className="main-column">
          <WebMidiNote />
          <section className="console" aria-label="Editor">
            <div className="console-column">
              <MainPanel state={working} setParam={setParam} />
              <HiddenOptionsPanel state={working} setParam={setParam} />
            </div>
            <PerformancePanel />
          </section>
          <DipPanel state={working} setParam={setParam} />
          <GlobalSettingsPanel />
          <VirtualPedalView pedal={virtualPedal} />
          <footer className="affiliation-notice">
            Unofficial, free and open-source editor for the Clean pedal. Not affiliated with or endorsed by the
            pedal's maker.
          </footer>
        </main>
      </div>
      <DataDrawer />
      <ControlHelpTip />
    </div>
  );
}
