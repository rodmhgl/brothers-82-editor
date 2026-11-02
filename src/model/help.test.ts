import { describe, expect, it } from 'vitest';
import { PARAMS, type ParamId } from '../midi/map';
import { initialEditorState, type EditorState } from './core';
import { describeControl } from './help';

function withWorking(working: Partial<EditorState['working']>): EditorState {
  const state = initialEditorState();
  return { ...state, working: { ...state.working, ...working } };
}

describe('describeControl', () => {
  it('gives a knob its name, CC, current value as a percentage and description', () => {
    expect(describeControl('gain1', withWorking({ gain1: 127 }))).toEqual({
      name: 'Gain 1',
      cc: 16,
      value: 127,
      meaning: '100%',
      description: PARAMS.gain1.help,
    });
  });

  it('shows a toggle or switch value by its label', () => {
    expect(describeControl('ampType', withWorking({ ampType: 2 })).meaning).toBe('Plexi');
    expect(describeControl('effectOrder', withWorking({ effectOrder: 3 })).meaning).toBe('2<1');
    expect(describeControl('clean1', withWorking({ clean1: 127 })).meaning).toBe('On');
    expect(describeControl('sweep', withWorking({ sweep: 127 })).meaning).toBe('T');
    expect(describeControl('channel1Bypass', withWorking({ channel1Bypass: 0 })).meaning).toBe('Bypassed');
  });

  it('reads Expression from the Performance Controls', () => {
    const state = initialEditorState();
    const help = describeControl('expression', { ...state, performance: { expression: 127 } });
    expect(help).toMatchObject({ name: 'Expression', cc: 100, value: 127, meaning: '100%', description: PARAMS.expression.help });
  });

  it('describes every param', () => {
    const state = initialEditorState();
    for (const id of Object.keys(PARAMS) as ParamId[]) {
      const help = describeControl(id, state);
      expect(help.name, id).not.toBe('');
      expect(help.meaning, id).not.toBe('');
      expect(help.description, id).not.toBe('');
    }
  });
});
