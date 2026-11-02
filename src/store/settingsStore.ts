import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Settings } from './session';

/** The settings only the UI reads. Auto Send All and the send throttle are transport concerns, kept in the editor store. */
export type UiSettings = Pick<Settings, 'knobSensitivity' | 'theme' | 'uiScale' | 'showCcNumbers' | 'confirmOverwrite'>;

type SettingsStore = UiSettings & { update(change: Partial<UiSettings>): void };

/** Just the UI settings, from `settings` or anything holding them. */
export function uiSettingsOf({ knobSensitivity, theme, uiScale, showCcNumbers, confirmOverwrite }: UiSettings): UiSettings {
  return { knobSensitivity, theme, uiScale, showCcNumbers, confirmOverwrite };
}

export function createSettingsStore() {
  return create<SettingsStore>((set) => ({
    ...uiSettingsOf(DEFAULT_SETTINGS),
    update: (change) => set(change),
  }));
}

export const useSettingsStore = createSettingsStore();
