import { SLOTS, isToggleSlot, slotNumber, slotReach } from '../../model/slots';
import { useEditorStore } from '../../store/editorStore';
import { slotInfo, useLibraryStore, useWorkingStateModified, type SlotInfo } from '../../store/library';
import { CHANGED_SINCE_STORED, ChangedMarker, slotLabelSuffix } from '../slotLabels';
import { StoreButton } from '../StoreButton';
import { useArmedConfirm } from '../useArmedConfirm';

/** Where a known Slot's contents came from, and when the editor stored them. */
function storedSummary({ entry, preset }: SlotInfo): string {
  const when = new Date(entry.writtenAt).toLocaleString();
  if (preset) return `Stored ${when} from Preset “${preset.name}”.`;
  if (entry.presetId) return `Stored ${when}. Its Preset has since been deleted.`;
  return `Stored ${when}, not from a Preset.`;
}

/** The selected Slot's actions, and a map of all 122 Slots (SPEC.md §5.7). */
export function SlotsTab() {
  const selectedSlot = useEditorStore((s) => s.selectedSlot);
  const selectSlot = useEditorStore((s) => s.selectSlot);
  const slotMap = useEditorStore((s) => s.editor.slotMap);
  const sendingAll = useEditorStore((s) => s.sendingAll);
  const presets = useLibraryStore((s) => s.presets);
  const recallSlot = useLibraryStore((s) => s.recallSlot);
  const reStoreSlot = useLibraryStore((s) => s.reStoreSlot);
  const modified = useWorkingStateModified();
  const selected = slotInfo(slotMap, presets, selectedSlot);
  // Re-store is one click, unless loading the Preset would throw away unsaved edits to the Working State.
  const reStore = useArmedConfirm(() => void reStoreSlot(selectedSlot), selectedSlot);
  const clickReStore = modified ? reStore.click : () => void reStoreSlot(selectedSlot);

  return (
    <div className="slots-tab">
      <section className="slot-card" aria-label="Selected Slot">
        <div className="slot-card-reach">
          Slot {slotNumber(selectedSlot)} · {slotReach(selectedSlot)}
        </div>
        {selected ? (
          <>
            <div className="slot-card-name">
              {selected.name}
              {selected.changed && <ChangedMarker />}
            </div>
            <div className="slot-card-summary">{storedSummary(selected)}</div>
          </>
        ) : (
          <>
            <div className="slot-card-name is-unnamed">Contents unknown</div>
            <div className="slot-card-summary">Not in the Slot Map yet — the editor hasn’t stored anything here.</div>
          </>
        )}
        {selected?.changed && (
          <div className="slot-card-changed" role="status">
            <span>
              “{selected.name}” has {CHANGED_SINCE_STORED}.
            </span>
            <button
              type="button"
              className={`solid-button${reStore.armed ? ' is-armed' : ''}`}
              disabled={sendingAll}
              title={`Stores the Preset as it is now in Slot ${selectedSlot}; it becomes the Working State.`}
              onClick={clickReStore}
            >
              {reStore.armed ? 'Discard unsaved edits? Click again' : 'Re-store'}
            </button>
          </div>
        )}
        <div className="slot-card-actions">
          <button type="button" className="outline-button" onClick={() => recallSlot(selectedSlot)}>
            Recall · PC {selectedSlot}
          </button>
          <StoreButton slot={selectedSlot} label="Send All + Store · CC 111" className="solid-button" />
        </div>
      </section>
      <div className="slot-map-head">
        <span>Slot Map · PC 1–{SLOTS.length}</span>
        <span>
          <span className="slot-key" aria-hidden="true" /> Toggle Slots 1–2
        </span>
        <span>
          <span className="slot-key is-stored" aria-hidden="true" /> Stored
        </span>
      </div>
      <div className="slot-grid" role="group" aria-label="Slot Map">
        {SLOTS.map((slot) => {
          const info = slotInfo(slotMap, presets, slot);
          return (
            <button
              key={slot}
              type="button"
              className={`slot-cell${isToggleSlot(slot) ? ' is-toggle' : ''}${info ? ' is-stored' : ''}${info?.changed ? ' is-changed' : ''}${slot === selectedSlot ? ' is-active' : ''}`}
              aria-pressed={slot === selectedSlot}
              aria-label={`Slot ${slot} · ${slotReach(slot)}${slotLabelSuffix(info)}`}
              title={info?.name}
              onClick={() => selectSlot(slot)}
            >
              {slotNumber(slot)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
