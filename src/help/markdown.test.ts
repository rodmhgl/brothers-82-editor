import { describe, expect, it } from 'vitest';
import { parseHelp } from './markdown';

describe('parseHelp', () => {
  it('reads headings, paragraphs joined across lines, and both kinds of list', () => {
    const md = [
      '## Getting connected',
      '',
      'The pedal listens',
      'over a cable.',
      '',
      '### Steps',
      '1. Plug in.',
      '2. Pick the output.',
      '',
      '- one',
      '- two',
      '',
    ].join('\n');
    expect(parseHelp(md)).toEqual([
      { type: 'heading', level: 2, text: [{ type: 'text', text: 'Getting connected' }] },
      { type: 'paragraph', text: [{ type: 'text', text: 'The pedal listens over a cable.' }] },
      { type: 'heading', level: 3, text: [{ type: 'text', text: 'Steps' }] },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'Plug in.' }], [{ type: 'text', text: 'Pick the output.' }]],
      },
      { type: 'list', ordered: false, items: [[{ type: 'text', text: 'one' }], [{ type: 'text', text: 'two' }]] },
    ]);
  });

  it('reads bold and code inline', () => {
    expect(parseHelp('Use a **TRS** cable on `CC 14` now.')).toEqual([
      {
        type: 'paragraph',
        text: [
          { type: 'text', text: 'Use a ' },
          { type: 'strong', text: 'TRS' },
          { type: 'text', text: ' cable on ' },
          { type: 'code', text: 'CC 14' },
          { type: 'text', text: ' now.' },
        ],
      },
    ]);
  });

  it('reads an action placeholder on its own line, ending the paragraph before it', () => {
    expect(parseHelp('Set it up:\n{{midi-channel-wizard}}\nThen play.')).toEqual([
      { type: 'paragraph', text: [{ type: 'text', text: 'Set it up:' }] },
      { type: 'action', id: 'midi-channel-wizard' },
      { type: 'paragraph', text: [{ type: 'text', text: 'Then play.' }] },
    ]);
  });
});
