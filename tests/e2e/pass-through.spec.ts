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
  await expect(log.getByRole('listitem').last()).toHaveText('CC 15 = 100 → Vol 2');
  await expect(editor.getByRole('slider', { name: 'Vol 2' })).toHaveAttribute('aria-valuenow', '100');

  // Another MIDI channel, and MIDI clock, are ignored: nothing reaches the pedal.
  await play(page, [0xb4, 15, 3]);
  await play(page, [0xf8]);
  await play(page, [0xc1, 9]);
  await expect(log.getByRole('listitem').nth(-2)).toHaveText('CC 15 = 100 → Vol 2');
  await expect(log.getByRole('listitem').last()).toHaveText('PC 9 → recall Slot 9 → empty, nothing changes');
  await expect(page.getByLabel('Sync Status')).toHaveText('Unknown');
});

test('every kind of control follows a passed-through CC, on screen and on the Virtual Pedal', async ({ page }) => {
  await withSimulatedInput(page);
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const pedal = page.getByRole('region', { name: 'Pedal' });
  await page.getByLabel('MIDI input').selectOption({ label: 'Test DAW' });

  await play(page, [0xb1, 23, 3]);
  await expect(log.getByRole('listitem').last()).toHaveText('CC 23 = 3 → OD Type → RJM');
  await expect(pedal.getByRole('group', { name: 'OD Type' }).getByRole('radio', { name: 'RJM' })).toBeChecked();

  await play(page, [0xb1, 102, 127]);
  await expect(pedal.getByRole('button', { name: 'Channel 1 Bypass' })).toContainText('Channel 1 Bypass · Engaged');

  await play(page, [0xb1, 71, 127]);
  await expect(page.getByRole('region', { name: 'Dip switches' }).getByRole('switch', { name: 'Noise Gate' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  await play(page, [0xb1, 27, 20]);
  await expect(page.getByRole('group', { name: 'Hidden Options' }).getByRole('slider', { name: 'Gate Threshold' })).toHaveAttribute(
    'aria-valuenow',
    '20',
  );

  await play(page, [0xb1, 100, 90]);
  await expect(page.getByRole('region', { name: 'Performance' }).getByRole('slider', { name: 'Expression' })).toHaveValue('90');
});

test('a CC outside the MIDI map is forwarded but not decoded, and shows in the MIDI Monitor', async ({ page }) => {
  await withSimulatedInput(page);
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  await page.getByLabel('MIDI input').selectOption({ label: 'Test DAW' });
  await page.getByRole('button', { name: 'Send All', exact: true }).click();
  await expect(page.getByLabel('Sync Status')).toHaveText('In Sync');

  await play(page, [0xb1, 105, 127]);
  await expect(log.getByRole('listitem').last()).toHaveText('CC 105 = 127 → (not in MIDI map)');
  await expect(page.getByLabel('Sync Status')).toHaveText('In Sync');

  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('tab', { name: /MIDI Monitor/ }).click();
  const rows = page.getByRole('complementary', { name: 'Data' }).getByRole('log', { name: 'Outgoing MIDI' }).getByRole('listitem');
  await expect(rows.first()).toContainText(/CC\s*105\s*127\s*—/);
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

  await expect(log.getByRole('listitem').last()).toHaveText('CC 15 = 101 → Vol 2');
  await expect(log.getByRole('listitem')).toHaveCount(before + 1);
});
