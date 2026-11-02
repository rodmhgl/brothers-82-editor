import { expect, test } from '@playwright/test';

// As in library.spec.ts: the folder picker hands back a folder in the browser's private file system.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('My Presets', { create: true });
  });
});

test('the rail and the Slot grid show the two Toggle Slots and no Bank; a factory Toggle Slot recalls as Unknown', async ({ page }) => {
  await page.goto('/');
  const rail = page.getByRole('navigation', { name: 'Slots' });
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const syncStatus = page.getByRole('banner', { name: 'Connection' }).getByLabel('Sync Status');

  await expect(rail.getByRole('button', { name: /Toggle/ })).toHaveText([/^01 · Toggle R/, /^02 · Toggle L/]);
  await expect(rail.getByRole('button', { name: 'Recall Slot 1 · Toggle Right' })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Recall Slot 2 · Toggle Left' })).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Recall Slot 3 · MIDI only' })).toBeVisible();

  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Slots' }).click();
  await expect(drawer.getByRole('button', { name: /Toggle/ })).toHaveCount(2);
  await expect(drawer.getByRole('button', { name: 'Slot 1 · Toggle Right' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Slot 2 · Toggle Left' })).toBeVisible();
  await expect(drawer.getByText('Toggle Slots 1–2')).toBeVisible();
  await expect(page.getByText(/Bank/)).toHaveCount(0);

  // The factory presets in Slots 1 and 2 aren't in the Slot Map (hardware check #7).
  await page.getByRole('button', { name: 'Send All', exact: true }).click();
  await expect(syncStatus).toHaveText('In Sync');
  await rail.getByRole('button', { name: 'Recall Slot 1 · Toggle Right' }).click();
  await expect(syncStatus).toHaveText('Unknown');
});

test('store and recall a Slot against the Virtual Pedal, re-storing once its Preset changes', async ({ page }) => {
  await page.goto('/');
  const connection = page.getByRole('banner', { name: 'Connection' });
  const syncStatus = connection.getByLabel('Sync Status');
  const editor = page.getByRole('region', { name: 'Editor' });
  const eq = editor.getByRole('slider', { name: 'EQ', exact: true });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const log = pedal.getByRole('log');
  const rail = page.getByRole('navigation', { name: 'Slots' });
  const drawer = page.getByRole('complementary', { name: 'Data' });

  // Save a Preset, so the Slot links to it.
  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Library' }).click();
  await drawer.getByRole('button', { name: 'Choose folder…' }).click();
  await eq.press('PageUp');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await drawer.getByRole('form', { name: 'Save As' }).getByLabel('Preset name').fill('Shimmer Tape');
  await drawer.getByRole('button', { name: 'OK' }).click();

  // Store it in Slot 7: Send All, then CC 111 = 7, after a confirming click.
  await drawer.getByRole('tab', { name: 'Slots' }).click();
  await drawer.getByRole('button', { name: 'Slot 7 · MIDI only' }).click();
  await drawer.getByRole('button', { name: 'Send All + Store · CC 111' }).click();
  await drawer.getByRole('button', { name: 'Overwrite Slot 07? Click again' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('CC 111 = 7 → stored in Slot 7');
  const card = drawer.getByRole('region', { name: 'Selected Slot' });
  await expect(card.getByText('Shimmer Tape', { exact: true })).toBeVisible();
  await expect(card.getByText(/from Preset “Shimmer Tape”/)).toBeVisible();
  await expect(rail.getByRole('button', { name: 'Recall Slot 7 · MIDI only · Shimmer Tape' })).toBeVisible();

  // A known Slot overwrites only after confirming, by name.
  await drawer.getByRole('button', { name: 'Send All + Store · CC 111' }).click();
  await expect(drawer.getByRole('button', { name: 'Overwrite “Shimmer Tape” in Slot 07? Click again' })).toBeVisible();

  // Live: the pedal follows its own controls, so the editor can't be sure.
  await rail.getByRole('button', { name: 'Live · PC 0' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 0 → Live');
  await expect(syncStatus).toHaveText('Possibly Stale');

  // Edit, then recall Slot 7: the Working State becomes its snapshot, In Sync, on both editor and pedal.
  await eq.press('PageUp');
  await expect(eq).toHaveAttribute('aria-valuenow', '84');
  await rail.getByRole('button', { name: /^Recall Slot 7 ·/ }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('PC 7 → recall Slot 7');
  await expect(syncStatus).toHaveText('In Sync');
  await expect(eq).toHaveAttribute('aria-valuenow', '74');
  await expect(pedal.getByLabel('EQ', { exact: true })).toHaveText('74');
  await expect(connection.getByLabel('Working State')).toHaveText('Shimmer Tape');

  // An unknown Slot: Unknown.
  await rail.getByRole('button', { name: /^Recall Slot 8 ·/ }).click();
  await expect(syncStatus).toHaveText('Unknown');

  // Change the Preset: the Slot shows it, and one click re-stores it.
  await eq.press('PageUp');
  await drawer.getByRole('tab', { name: 'Library' }).click();
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(rail.getByRole('button', { name: /^Recall Slot 7 · MIDI only · Shimmer Tape, changed since stored$/ })).toBeVisible();
  await drawer.getByRole('tab', { name: 'Slots' }).click();
  await drawer.getByRole('button', { name: /^Slot 7 ·/ }).click();
  // Re-store loads the Preset, so with unsaved edits it asks first.
  await eq.press('PageUp');
  await drawer.getByRole('button', { name: 'Re-store' }).click();
  await drawer.getByRole('button', { name: 'Discard unsaved edits? Click again' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('CC 111 = 7 → stored in Slot 7');
  await expect(eq).toHaveAttribute('aria-valuenow', '84');
  await expect(rail.getByRole('button', { name: 'Recall Slot 7 · MIDI only · Shimmer Tape' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Re-store' })).toHaveCount(0);
});
