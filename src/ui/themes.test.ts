import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, THEMES, type Theme } from '../store/session';

// Each theme as app.css paints it: the :root tokens, overridden by that theme's :root[data-theme] block.
const CSS = readFileSync(new URL('./app.css', import.meta.url), 'utf8');

function declarations(selector: string): Record<string, string> | undefined {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = new RegExp(`^${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(CSS)?.[1];
  if (block === undefined) return undefined;
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) tokens[name!] = value!.trim();
  return tokens;
}

function tokensOf(theme: Theme): Record<string, string> {
  return { ...declarations(':root'), ...declarations(`:root[data-theme='${theme}']`) };
}

function colour(tokens: Record<string, string>, name: string): [number, number, number] {
  let value = tokens[name];
  for (let ref; (ref = /^var\((--[\w-]+)\)$/.exec(value ?? '')); ) value = tokens[ref[1]!];
  const hex = /^#([0-9a-f]{6})$/i.exec(value ?? '')?.[1];
  if (!hex) throw new Error(`${name} is not a #rrggbb colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2 relative luminance. */
function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio. */
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function hue([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('themes', () => {
  it('offers six, each with its own palette in app.css', () => {
    const themes = Object.keys(THEMES) as Theme[];
    expect(themes).toHaveLength(6);
    for (const theme of themes) {
      if (theme !== DEFAULT_SETTINGS.theme) expect(declarations(`:root[data-theme='${theme}']`), theme).toBeDefined();
    }
  });

  it('defaults to an amber accent', () => {
    const accent = colour(tokensOf(DEFAULT_SETTINGS.theme), '--accent');
    expect(hue(accent)).toBeGreaterThanOrEqual(30);
    expect(hue(accent)).toBeLessThanOrEqual(50);
  });

  // WCAG 2 AA: 4.5:1 for text, 3:1 for a control or indicator against what surrounds it.
  describe.each(Object.keys(THEMES) as Theme[])('%s', (theme) => {
    const tokens = tokensOf(theme);
    const ratio = (a: string, b: string) => contrast(colour(tokens, a), colour(tokens, b));

    it('keeps text readable on every surface', () => {
      for (const surface of ['--paper', '--card', '--inset']) {
        expect(ratio('--ink', surface), `ink on ${surface}`).toBeGreaterThanOrEqual(7);
        expect(ratio('--text-2', surface), `text-2 on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio('--muted', surface), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio('--warning', surface), `warning on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it('keeps text readable on the accent', () => {
      expect(ratio('--on-accent', '--accent')).toBeGreaterThanOrEqual(4.5);
    });

    it('keeps the accents visible against the page', () => {
      for (const accent of ['--accent', '--accent-2']) {
        for (const surface of ['--paper', '--card']) {
          expect(ratio(accent, surface), `${accent} on ${surface}`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });
});
