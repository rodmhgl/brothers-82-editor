import { useEffect, useRef, useState } from 'react';
import { PARAMS, type ParamDef, type ParamId } from '../../midi/map';
import { describeControl } from '../../model/help';
import { useEditorStore } from '../../store/editorStore';

/** How long the pointer rests on a control before its help shows. */
const HOVER_DELAY_MS = 350;
const GAP_PX = 8;
/** The card's width in app.css; it is centred on the control but kept inside the window. */
const TIP_HALF_WIDTH_PX = 140;
const TIP_ID = 'control-help';
const FOCUSABLE = 'button, input, select, [tabindex]';

/** Marks an element as a control: hovering or keyboard-focusing it shows that param's help. */
export const helpFor = (param: ParamDef) => ({ 'data-help': param.id });

type Target = { el: HTMLElement; id: ParamId };

function helpTarget(node: EventTarget | null): Target | null {
  const el = node instanceof Element ? node.closest<HTMLElement>('[data-help]') : null;
  const id = el?.dataset.help;
  return el && id && id in PARAMS ? { el, id: id as ParamId } : null;
}

/**
 * The help card for whichever control is under the pointer or has keyboard focus (SPEC.md §5.10): name, CC, current
 * value and meaning, and a description. It reads the live state, so it updates while dragging.
 */
export function ControlHelpTip() {
  const [target, setTarget] = useState<Target | null>(null);
  const editor = useEditorStore((s) => s.editor);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (next: Target | null, delay: number) => {
      // Moving between a control's own parts fires again for the same control: leave its pending card be.
      if (next?.el === current.current) return;
      clearTimeout(timer);
      current.current = next?.el ?? null;
      if (!next) return setTarget(null);
      timer = setTimeout(() => setTarget(next), delay);
    };
    // A touch shows the card at once, since there is no hover to wait on.
    const onPointerOver = (e: PointerEvent) => show(helpTarget(e.target), e.pointerType === 'touch' ? 0 : HOVER_DELAY_MS);
    // Leaving the window fires no pointerover anywhere, so hide here.
    const onPointerOut = (e: PointerEvent) => {
      if (!e.relatedTarget) show(null, 0);
    };
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.matches(':focus-visible')) show(helpTarget(e.target), 0);
    };
    const onFocusOut = (e: FocusEvent) => {
      if (helpTarget(e.target)?.el === current.current && !helpTarget(e.relatedTarget)) show(null, 0);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') show(null, 0);
    };
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Screen readers hear the card as the control's description while it shows: on the control itself when the
  // marked element wraps exactly one (a knob's dial), else on the wrapper (a toggle's group of positions).
  useEffect(() => {
    if (!target) return;
    const focusables = target.el.querySelectorAll<HTMLElement>(FOCUSABLE);
    const el = target.el.matches(FOCUSABLE) || focusables.length !== 1 ? target.el : focusables[0]!;
    el.setAttribute('aria-describedby', TIP_ID);
    return () => el.removeAttribute('aria-describedby');
  }, [target]);

  if (!target || !target.el.isConnected) return null;
  const help = describeControl(target.id, editor);
  // The page is zoomed (layoutScale.ts) but the card is placed in the layout's own px, so measure in those.
  const zoom = document.documentElement.currentCSSZoom || 1;
  const box = target.el.getBoundingClientRect();
  const rect = { left: box.left / zoom, top: box.top / zoom, bottom: box.bottom / zoom, width: box.width / zoom, height: box.height / zoom };
  const windowWidth = window.innerWidth / zoom;
  const windowHeight = window.innerHeight / zoom;
  // Below the control in the top half of the window, above it in the bottom half.
  const below = rect.top + rect.height / 2 < windowHeight / 2;
  const style = {
    left: Math.min(Math.max(GAP_PX + TIP_HALF_WIDTH_PX, rect.left + rect.width / 2), windowWidth - GAP_PX - TIP_HALF_WIDTH_PX),
    ...(below ? { top: rect.bottom + GAP_PX } : { bottom: windowHeight - rect.top + GAP_PX }),
  };

  return (
    <div id={TIP_ID} className={`control-help${below ? ' is-below' : ' is-above'}`} role="tooltip" style={style}>
      <div className="control-help-head">
        <span className="control-help-name">{help.name}</span>
        <span className="control-help-cc">CC {help.cc}</span>
      </div>
      <div className="control-help-value">{help.value} · {help.meaning}</div>
      <p className="control-help-description">{help.description}</p>
    </div>
  );
}
