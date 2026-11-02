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
});
