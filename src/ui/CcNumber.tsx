import type { ReactNode } from 'react';
import { useSettingsStore } from '../store/settingsStore';

/** A control's CC number beside it, shown only while the "Show CC numbers" setting is on. */
export function CcNumber({ children }: { children: ReactNode }) {
  const show = useSettingsStore((s) => s.showCcNumbers);
  return show ? children : null;
}
