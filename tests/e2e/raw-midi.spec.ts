import { expect, test } from '@playwright/test';

test('Raw MIDI sends a CC and a Program Change exactly as typed', async ({ page }) => {
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('tab', { name: /MIDI Monitor/ }).click();
  await page.getByText('Raw MIDI (hardware checks)').click();

  const cc = page.getByRole('form', { name: 'Send CC' });
  await cc.getByLabel('CC').fill('21');
  await cc.getByLabel('Value').fill('0');
  await cc.getByRole('button', { name: 'Send CC' }).click();
  // Sent unclamped (0, not 1); the pedal reads 0 as position 1, and so does the editor.
  await expect(log.getByRole('listitem').last()).toHaveText('CC 21 = 0 → Release → Fast');
  await expect(
    page.getByRole('region', { name: 'Editor' }).getByRole('group', { name: 'Release' }).getByRole('radio', { name: 'Fast' }),
  ).toBeChecked();

  const pc = page.getByRole('form', { name: 'Send Program Change' });
  await pc.getByLabel('Program').fill('2');
  await pc.getByRole('button', { name: 'Send PC' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 2 → recall Slot 2 → factory preset (not simulated), nothing changes');
});

test('Raw MIDI refuses Factory Reset unless explicitly allowed', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('tab', { name: /MIDI Monitor/ }).click();
  await page.getByText('Raw MIDI (hardware checks)').click();
  const cc = page.getByRole('form', { name: 'Send CC' });

  await cc.getByLabel('CC').fill('56');
  await expect(cc.getByRole('button', { name: 'Send CC' })).toBeDisabled();
  await cc.getByLabel(/Factory Reset/).check();
  await expect(cc.getByRole('button', { name: 'Send CC' })).toBeEnabled();
});
