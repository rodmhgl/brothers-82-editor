import { expect, test } from '@playwright/test';

test('the Data drawer opens from the top bar, stays open after a reload and closes', async ({ page }) => {
  await page.goto('/');
  const dataButton = page.getByRole('button', { name: /^Data/ });
  const drawer = page.getByRole('complementary', { name: 'Data' });

  await expect(dataButton).toHaveAttribute('aria-expanded', 'false');
  await dataButton.click();
  await page.getByRole('tab', { name: 'Slots' }).click();
  await expect(drawer.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: /^Data/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true');

  await drawer.getByRole('button', { name: 'Close Data drawer' }).click();
  await expect(page.getByRole('button', { name: /^Data/ })).toHaveAttribute('aria-expanded', 'false');
});

test('the MIDI Monitor shows outgoing messages newest first, one row per repeated CC', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('tab', { name: /MIDI Monitor/ }).click();
  const drawer = page.getByRole('complementary', { name: 'Data' });
  await expect(drawer.getByText('Move a control to see outgoing messages.')).toBeVisible();

  const editor = page.getByRole('region', { name: 'Editor' });
  const sensitivity = editor.getByRole('slider', { name: 'Sensitivity' });
  await sensitivity.press('ArrowUp');
  await sensitivity.press('ArrowUp');
  await editor.getByRole('group', { name: 'Release' }).getByRole('radio', { name: 'Fast' }).check();

  const rows = drawer.getByRole('log', { name: 'Outgoing MIDI' }).getByRole('listitem');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(/CC\s*21\s*1\s*Release · Fast/);
  await expect(rows.nth(1)).toContainText(/CC\s*15\s*79\s*Sensitivity/);

  await drawer.getByRole('button', { name: 'Clear' }).click();
  await expect(drawer.getByText('Move a control to see outgoing messages.')).toBeVisible();
});

test('the Parameters table edits values and ramp target dips', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Data/ }).click();
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');

  await drawer.getByRole('slider', { name: 'Envelope Balance' }).press('PageUp');
  await expect(log.getByRole('listitem').last()).toHaveText('CC 28 = 10 → Envelope Balance');
  await expect(page.getByRole('region', { name: 'Hidden Options' }).getByRole('slider', { name: 'Envelope Balance' })).toHaveAttribute(
    'aria-valuenow',
    '10',
  );

  await drawer.getByRole('checkbox', { name: 'Attack target' }).check();
  await expect(log.getByRole('listitem').last()).toHaveText('CC 62 = 127 → Attack target → On · Ramping engaged: SENSITIVITY knob now sets ramp speed');
  await expect(page.getByRole('region', { name: 'Dip switches' }).getByRole('switch', { name: 'Attack target' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
});

test('recalling a Slot sends PC n; storing asks first, then sends everything and CC 111', async ({ page }) => {
  await page.goto('/');
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const syncStatus = page.getByRole('banner').getByLabel('Sync Status');

  await page.getByRole('navigation', { name: 'Slots' }).getByRole('button', { name: /^Recall Slot 5 ·/ }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 5 → recall Slot 5 → empty, nothing changes');
  await expect(syncStatus).toHaveText('Unknown');

  const store = page.getByRole('button', { name: 'Store to 05' });
  await store.click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 5 → recall Slot 5 → empty, nothing changes');
  await page.getByRole('button', { name: /Overwrite Slot 05\?/ }).click();

  await expect(log.getByRole('listitem').last()).toHaveText('CC 111 = 5 → stored in Slot 5');
  await expect(syncStatus).toHaveText('In Sync');
});

test('the Slots tab selects a Slot without recalling it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('tab', { name: 'Slots' }).click();
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');

  await drawer.getByRole('button', { name: 'Slot 2 · Toggle Left' }).click();
  await expect(drawer.getByText('Slot 02 · Toggle Left')).toBeVisible();
  await expect(log.getByRole('listitem')).toHaveCount(0);

  await drawer.getByRole('button', { name: 'Recall · PC 2' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 2 → recall Slot 2 → factory preset (not simulated), nothing changes');
});

test('dips send their CCs', async ({ page }) => {
  await page.goto('/');
  const dips = page.getByRole('region', { name: 'Dip switches' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');

  const sweep = dips.getByRole('switch', { name: 'Sweep' });
  await expect(sweep).toContainText('Sweep B');
  await sweep.click();
  await expect(sweep).toContainText('Sweep T');
  await expect(log.getByRole('listitem').last()).toHaveText('CC 67 = 127 → Sweep → T');
});
