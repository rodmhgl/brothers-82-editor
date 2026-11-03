import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PARAMS } from '../midi/map';
import { parseHelp } from './markdown';

const HELP_FILES = readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.md'));
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

/** The maker's name and product names: help text is the project's own, about the pedal, not its maker. */
const MANUFACTURER_NAMES = /chase\s*bliss|midibox|generation\s*loss/i;

describe('help content', () => {
  it('names no manufacturer or its products', () => {
    const texts = [
      ...HELP_FILES.map(read),
      ...Object.values(PARAMS).map((p) => p.help),
    ];
    for (const text of texts) expect(text).not.toMatch(MANUFACTURER_NAMES);
  });

  it('has a Getting connected guide whose actions the Help tab offers', () => {
    const blocks = parseHelp(read('getting-connected.md'));
    const actions = blocks.flatMap((b) => (b.type === 'action' ? [b.id] : []));
    expect(actions.sort()).toEqual(['midi-channel-wizard', 'use-virtual-pedal']);
  });

  it('explains the physical Bank dip in Getting connected', () => {
    const guide = read('getting-connected.md');
    for (const topic of [/Bank/, /Slots? 3/, /Slots? 4/, /Program Change/]) expect(guide).toMatch(topic);
  });

  it('has a How the Channels interact guide covering Effect Order, Clean 1 and Master', () => {
    const guide = read('how-the-channels-interact.md');
    expect(parseHelp(guide)[0]).toMatchObject({ type: 'heading', level: 2, text: [{ text: 'How the Channels interact' }] });
    for (const topic of [/Effect Order/, /2>1/, /2\+1/, /2<1/, /Clean 1/, /clean blend/, /Master/, /stack mix/, /Vol 2/]) {
      expect(guide).toMatch(topic);
    }
  });
});
