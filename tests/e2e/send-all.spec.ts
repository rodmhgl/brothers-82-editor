import { expect, test } from '@playwright/test';

test('Send All reproduces the Working State on the Virtual Pedal and makes it In Sync', async ({ page }) => {
  await page.goto('/');
  const connection = page.getByRole('banner', { name: 'Connection' });
  const editor = page.getByRole('region', { name: 'Editor' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const log = pedal.getByRole('log');
  const syncStatus = connection.getByLabel('Sync Status');

  await expect(syncStatus).toHaveText('Possibly Stale');
  await expect(connection.getByLabel('Send All on connect')).toBeChecked();

  // The Virtual Pedal listens on MIDI channel 2, so edits on 5 leave it behind the editor.
  await connection.getByLabel('MIDI channel').selectOption('5');
  await page.getByRole('region', { name: 'Dip switches' }).getByRole('switch', { name: 'Master' }).click();
  await editor.getByRole('group', { name: 'Effect Order' }).getByRole('radio', { name: '2>1' }).check();
  await editor.getByRole('button', { name: 'Channel 1 Bypass' }).click();
  await page.keyboard.press('2');
  await editor.getByRole('slider', { name: 'Vol 2' }).press('ArrowUp');
  await editor.getByRole('slider', { name: 'Vol 1', exact: true }).press('ArrowDown');
  await editor.getByRole('group', { name: 'OD Type' }).getByRole('radio', { name: 'RJM' }).check();
  await expect(syncStatus).toHaveText('Possibly Stale');
  await connection.getByLabel('MIDI channel').selectOption('2');

  await expect(pedal.getByLabel('Vol 2')).toHaveText('64');
  await expect(pedal.getByLabel('Channel 1 Bypass LED')).toHaveText('Off');
  await expect(pedal.getByLabel('Channel 2 Bypass LED')).toHaveText('On');

  await connection.getByRole('button', { name: 'Send All' }).click();

  await expect(syncStatus).toHaveText('In Sync');
  // Channel Bypass goes last, and Expression is never sent.
  await expect(log.getByRole('listitem').last()).toHaveText('CC 103 = 0 → Channel 2 Bypass → Bypassed');
  await expect(log.getByText('CC 23 = 3 → OD Type → RJM')).toBeVisible();
  await expect(log.getByText(/→ Expression/)).toHaveCount(0);
  await expect(pedal.getByLabel('Vol 2')).toHaveText('65');
  await expect(pedal.getByLabel('Vol 1', { exact: true })).toHaveText('63');
  await expect(pedal.getByLabel('Effect Order')).toHaveText('2>1');
  await expect(pedal.getByLabel('Channel 1 Bypass LED')).toHaveText('On');
  await expect(pedal.getByLabel('Channel 2 Bypass LED')).toHaveText('Off');
  await expect(pedal.getByLabel('Dips on')).toHaveText('Master');

  // A single edit keeps the status it found.
  await editor.getByRole('slider', { name: 'Vol 1', exact: true }).press('ArrowUp');
  await expect(log.getByRole('listitem').last()).toHaveText('CC 18 = 64 → Vol 1');
  await expect(syncStatus).toHaveText('In Sync');
});
