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
  await expect(log.getByRole('listitem').last()).toHaveText('CC 21 = 0 → Amp Type → 800');
  await expect(
    page.getByRole('region', { name: 'Editor' }).getByRole('group', { name: 'Amp Type' }).getByRole('radio', { name: '800' }),
  ).toBeChecked();

  const pc = page.getByRole('form', { name: 'Send Program Change' });
  await pc.getByLabel('Program').fill('2');
  await pc.getByRole('button', { name: 'Send PC' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 2 → recall Slot 2 → empty, nothing changes');
});

test('Raw MIDI sends CC 56 with no guard, and the MIDI Monitor shows it', async ({ page }) => {
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('tab', { name: /MIDI Monitor/ }).click();
  await page.getByText('Raw MIDI (hardware checks)').click();
  const cc = page.getByRole('form', { name: 'Send CC' });

  await cc.getByLabel('CC').fill('56');
  await cc.getByLabel('Value').fill('127');
  await cc.getByRole('button', { name: 'Send CC' }).click();

  await expect(log.getByRole('listitem').last()).toHaveText('CC 56 = 127 → (not in MIDI map)');
  const rows = page.getByRole('complementary', { name: 'Data' }).getByRole('log', { name: 'Outgoing MIDI' }).getByRole('listitem');
  await expect(rows.first()).toContainText(/CC\s*56\s*127\s*—/);
});
