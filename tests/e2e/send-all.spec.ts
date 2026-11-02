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
  await page.getByRole('region', { name: 'Dip switches' }).getByRole('switch', { name: 'Dusty' }).click();
  await editor.getByRole('group', { name: 'Mode' }).getByRole('radio', { name: 'Shifty' }).check();
  await editor.getByRole('button', { name: 'Swell' }).click();
  await page.keyboard.press('b');
  await editor.getByRole('slider', { name: 'Sensitivity' }).press('ArrowUp');
  await editor.getByRole('slider', { name: 'EQ', exact: true }).press('ArrowDown');
  await editor.getByRole('group', { name: 'Envelope Type' }).getByRole('radio', { name: 'Adaptive' }).check();
  await expect(syncStatus).toHaveText('Possibly Stale');
  await connection.getByLabel('MIDI channel').selectOption('2');

  await expect(pedal.getByLabel('Sensitivity')).toHaveText('77');
  await expect(pedal.getByLabel('Swell LED')).toHaveText('Off');
  await expect(pedal.getByLabel('Bypass LED')).toHaveText('On');

  await connection.getByRole('button', { name: 'Send All' }).click();

  await expect(syncStatus).toHaveText('In Sync');
  // Footswitches go last, and Performance Controls are never sent.
  await expect(log.getByRole('listitem').last()).toHaveText('CC 103 = 127 → Swell → On');
  await expect(log.getByText('CC 31 = 3 → Envelope Type → Adaptive')).toBeVisible();
  await expect(log.getByText(/→ (Dynamics Max|Ramping|Expression)/)).toHaveCount(0);
  await expect(pedal.getByLabel('Sensitivity')).toHaveText('78');
  await expect(pedal.getByLabel('EQ', { exact: true })).toHaveText('63');
  await expect(pedal.getByLabel('Mode')).toHaveText('Shifty');
  await expect(pedal.getByLabel('Swell LED')).toHaveText('On');
  await expect(pedal.getByLabel('Bypass LED')).toHaveText('Off');
  await expect(pedal.getByLabel('Dips on')).toHaveText('Dusty');

  // A single edit keeps the status it found.
  await editor.getByRole('slider', { name: 'EQ', exact: true }).press('ArrowUp');
  await expect(log.getByRole('listitem').last()).toHaveText('CC 18 = 64 → EQ');
  await expect(syncStatus).toHaveText('In Sync');
});
