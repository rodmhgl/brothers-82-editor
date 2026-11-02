import { expect, test } from '@playwright/test';

test('selecting MIDI channel 5 sends status 0xB4', async ({ page }) => {
  await page.goto('/');
  const connection = page.getByRole('banner', { name: 'Connection' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');

  await connection.getByLabel('MIDI channel').selectOption('5');
  await page.getByRole('region', { name: 'Editor' }).getByRole('slider', { name: 'Vol 2' }).press('ArrowUp');

  // 0xB4 is Control Change on MIDI channel 5; the Virtual Pedal listens on 2, so it ignores it.
  await expect(log.getByRole('listitem').last()).toHaveText(/on MIDI channel 5 → ignored/);
});

test('Test flips Channel 2 Bypass, then puts it back', async ({ page }) => {
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');

  await expect(page.getByLabel('Connection status')).toHaveText('Connected');
  await page.getByRole('button', { name: 'Test' }).click();

  await expect(log.getByRole('listitem')).toHaveText([
    'CC 103 = 0 → Channel 2 Bypass → Bypassed',
    'CC 103 = 127 → Channel 2 Bypass → Engaged',
  ]);
});
