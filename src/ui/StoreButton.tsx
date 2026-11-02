import { slotNumber } from '../model/slots';
import { useEditorStore } from '../store/editorStore';
import { slotInfo, useLibraryStore } from '../store/library';
import { useSettingsStore } from '../store/settingsStore';
import { useArmedConfirm } from './useArmedConfirm';

/**
 * Send All, then Save to Slot. Overwrites what the Slot held, so it asks for a second click first
 * (SPEC.md §5.7): even a Slot missing from the Slot Map may hold something stored on the pedal itself. The
 * "Confirm before overwrite" setting can turn that off.
 */
export function StoreButton({ slot, label, className }: { slot: number; label: string; className?: string }) {
  const storeSlot = useLibraryStore((s) => s.storeSlot);
  const sendingAll = useEditorStore((s) => s.sendingAll);
  const slotMap = useEditorStore((s) => s.editor.slotMap);
  const presets = useLibraryStore((s) => s.presets);
  const info = slotInfo(slotMap, presets, slot);
  const confirmOverwrite = useSettingsStore((s) => s.confirmOverwrite);
  // Arming is for one Slot only.
  const { armed, click } = useArmedConfirm(() => void storeSlot(slot), slot, confirmOverwrite);

  return (
    <button
      type="button"
      className={`${className ?? ''}${armed ? ' is-armed' : ''}`}
      disabled={sendingAll}
      title={`Sends everything, then stores it in Slot ${slot} (CC 111), replacing what the Slot held.`}
      onClick={click}
    >
      {armed ? `Overwrite ${info ? `“${info.name}” in ` : ''}Slot ${slotNumber(slot)}? Click again` : label}
    </button>
  );
}
