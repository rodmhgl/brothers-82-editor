import { expect, test } from '@playwright/test';

test('the MIDI channel wizard sets the pedal and the editor to the chosen MIDI channel', async ({ page }) => {
  await page.goto('/');
  const global = page.getByRole('region', { name: 'Global Settings' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const wizard = page.getByRole('dialog', { name: 'Set the pedal’s MIDI channel' });

  await global.getByRole('button', { name: 'Set pedal’s MIDI channel…' }).click();
  await wizard.getByLabel('New MIDI channel').selectOption('5');
  await wizard.getByRole('button', { name: 'Next' }).click();
  await expect(wizard.getByText('hold down both footswitches', { exact: false })).toBeVisible();
  await wizard.getByRole('button', { name: 'It’s powered up' }).click();
  await wizard.getByRole('button', { name: 'Send PC 0 on CH 05' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 0 on MIDI channel 5 → MIDI channel set to 5');
  await wizard.getByRole('button', { name: 'Done' }).click();
  await expect(wizard).toHaveCount(0);

  await expect(page.getByRole('banner').getByLabel('MIDI channel')).toHaveValue('5');
  await expect(global.getByLabel('MIDI channel')).toHaveText('CH 05');
  await page.getByRole('region', { name: 'Editor' }).getByRole('slider', { name: 'Vol 2' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect(log.getByRole('listitem').last()).toHaveText(/^CC 15 = \d+ → Vol 2$/);
});
