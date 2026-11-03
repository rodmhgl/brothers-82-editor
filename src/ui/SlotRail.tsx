import { SLOTS, TOGGLE_SLOT_COUNT, isToggleSlot, slotNumber, slotReach, slotReachShort } from '../model/slots';
import { useEditorStore } from '../store/editorStore';
import { slotInfo, useLibraryStore, type SlotInfo } from '../store/library';
import { ChangedMarker, slotLabelSuffix } from './slotLabels';

/** A Slot's name from the Slot Map, or a dash for a Slot the editor knows nothing about. */
function SlotName({ info, className }: { info: SlotInfo | undefined; className: string }) {
  if (!info) return <span className={`${className} is-unnamed`}>—</span>;
  return (
    <span className={className}>
      {info.name}
      {info.changed && <ChangedMarker />}
    </span>
  );
}

/** Live, then every Slot, Toggle Slots first. Clicking one recalls it on the pedal (PC n). */
export function SlotRail() {
  const selectedSlot = useEditorStore((s) => s.selectedSlot);
  const slotMap = useEditorStore((s) => s.editor.slotMap);
  const goLive = useEditorStore((s) => s.goLive);
  const presets = useLibraryStore((s) => s.presets);
  const recallSlot = useLibraryStore((s) => s.recallSlot);

  const button = (slot: number, className: string, children: (info: SlotInfo | undefined) => React.ReactNode) => {
    const info = slotInfo(slotMap, presets, slot);
    return (
      <button
        key={slot}
        type="button"
        className={`${className}${slot === selectedSlot ? ' is-active' : ''}`}
        aria-current={slot === selectedSlot ? 'true' : undefined}
        aria-label={`Recall Slot ${slot} · ${slotReach(slot)}${slotLabelSuffix(info)}`}
        onClick={() => recallSlot(slot)}
      >
        {children(info)}
      </button>
    );
  };

  return (
    <nav className="slot-rail" aria-label="Slots">
      <button
        type="button"
        className="live-button"
        title="The pedal follows its own knobs and toggles (PC 0). The editor can't read them."
        onClick={goLive}
      >
        Live · PC 0
      </button>
      <h2 className="rail-title">Toggle Slots</h2>
      <div className="toggle-slot-tiles">
        {SLOTS.filter(isToggleSlot).map((slot) =>
          button(slot, 'toggle-slot-tile', (info) => (
            <>
              <span className="tile-reach">
                {slotNumber(slot)} · {slotReachShort(slot)}
              </span>
              <SlotName info={info} className="tile-name" />
            </>
          )),
        )}
      </div>
      <h2 className="rail-title">Slots {TOGGLE_SLOT_COUNT + 1}–{SLOTS.length} · PC</h2>
      <div className="slot-list">
        {SLOTS.filter((s) => !isToggleSlot(s)).map((slot) =>
          button(slot, 'slot-row', (info) => (
            <>
              <span className="slot-row-number">{slotNumber(slot)}</span>
              <SlotName info={info} className="slot-row-name" />
            </>
          )),
        )}
      </div>
    </nav>
  );
}
