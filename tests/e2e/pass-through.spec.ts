import { expect, test, type Page } from '@playwright/test';

/** Replaces Web MIDI with one input, "Test DAW", that the test plays into with `window.playMidi`. */
async function withSimulatedInput(page: Page) {
  await page.addInitScript(() => {
    const input = { id: 'test-daw', name: 'Test DAW', type: 'input', state: 'connected', onmidimessage: null as null | ((e: { data: Uint8Array }) => void) };
    const access = { inputs: new Map([[input.id, input]]), outputs: new Map(), onstatechange: null };
    Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: async () => access });
    (window as unknown as { playMidi: (bytes: number[]) => void }).playMidi = (bytes) => input.onmidimessage?.({ data: new Uint8Array(bytes) });
  });
}

const play = (page: Page, bytes: number[]) => page.evaluate((b) => (window as unknown as { playMidi: (bytes: number[]) => void }).playMidi(b), bytes);

test('a simulated MIDI input automates the pedal on its MIDI channel, with the screen following', async ({ page }) => {
  await withSimulatedInput(page);
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const editor = page.getByRole('region', { name: 'Editor' });
  await page.getByLabel('MIDI input').selectOption({ label: 'Test DAW' });

  await play(page, [0xb1, 15, 100]);
  await expect(log.getByRole('listitem').last()).toHaveText('CC 15 = 100 → Sensitivity');
  await expect(editor.getByRole('slider', { name: 'Sensitivity' })).toHaveAttribute('aria-valuenow', '100');

  // Another MIDI channel, and MIDI clock, are ignored: nothing reaches the pedal.
  await play(page, [0xb4, 15, 3]);
  await play(page, [0xf8]);
  await play(page, [0xc1, 9]);
  await expect(log.getByRole('listitem').nth(-2)).toHaveText('CC 15 = 100 → Sensitivity');
  await expect(log.getByRole('listitem').last()).toHaveText('PC 9 → recall Slot 9 → empty, nothing changes');
  await expect(page.getByLabel('Sync Status')).toHaveText('Unknown');
});

test('AUX hold (CC 105) is forwarded unchanged and decoded, leaving the screen as it was', async ({ page }) => {
  await withSimulatedInput(page);
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const editor = page.getByRole('region', { name: 'Editor' });
  await page.getByLabel('MIDI input').selectOption({ label: 'Test DAW' });
  await page.getByRole('button', { name: 'Send All', exact: true }).click();
  await expect(page.getByLabel('Sync Status')).toHaveText('In Sync');
  const swell = editor.getByRole('button', { name: 'Swell', exact: true });
  const swellLed = page.getByRole('region', { name: 'Virtual Pedal' }).getByLabel('Swell LED');
  await expect(swell).toContainText('Swell · Off');

  await play(page, [0xb1, 105, 127]);
  await expect(log.getByRole('listitem').last()).toHaveText('CC 105 = 127 → AUX hold → On');
  await play(page, [0xb1, 105, 0]);
  await expect(log.getByRole('listitem').last()).toHaveText('CC 105 = 0 → AUX hold → Off');

  // A hold is momentary: the stored Swell state stays off, on screen and on the Virtual Pedal.
  await expect(swell).toContainText('Swell · Off');
  await expect(swellLed).toHaveText('Off');
  await expect(page.getByLabel('Sync Status')).toHaveText('In Sync');
});

test('nothing passes through until an input is selected', async ({ page }) => {
  await withSimulatedInput(page);
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  await expect(page.getByLabel('MIDI input')).toHaveValue('');
  const before = await log.getByRole('listitem').count();

  await play(page, [0xb1, 15, 100]);
  await page.getByLabel('MIDI input').selectOption({ label: 'Test DAW' });
  await play(page, [0xb1, 15, 101]);

  await expect(log.getByRole('listitem').last()).toHaveText('CC 15 = 101 → Sensitivity');
  await expect(log.getByRole('listitem')).toHaveCount(before + 1);
});
