import { expect, test, type Page } from '@playwright/test';

/** The session as last saved in IndexedDB, or undefined before the first save. */
function savedSession(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown> | undefined>((resolve, reject) => {
        const open = indexedDB.open('brothers-82-session');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('session')) return resolve(undefined);
          const get = db.transaction('session').objectStore('session').get('last');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
      }),
  );
}

test('reload restores every control, the Slot Map, MIDI channel and layout, Possibly Stale', async ({ page }) => {
  await page.goto('/');
  const connection = page.getByRole('banner', { name: 'Connection' });
  const syncStatus = connection.getByLabel('Sync Status');
  const editor = page.getByRole('region', { name: 'Editor' });
  const vol1 = editor.getByRole('slider', { name: 'Vol 1', exact: true });
  const ampType = editor.getByRole('group', { name: 'Amp Type' });
  const channel1 = editor.getByRole('button', { name: 'Channel 1 Bypass' });
  const channel2 = editor.getByRole('button', { name: 'Channel 2 Bypass' });
  const gateThreshold = page
    .getByRole('region', { name: 'Dip switches' })
    .getByRole('group', { name: 'Hidden Options' })
    .getByRole('slider', { name: 'Gate Threshold' });
  const rail = page.getByRole('navigation', { name: 'Slots' });
  const drawer = page.getByRole('complementary', { name: 'Data' });

  // Edit, then store in Slot 7: Send All makes it In Sync.
  await ampType.getByRole('radio', { name: '800' }).check();
  await vol1.press('PageUp');
  // Before the Data drawer opens over the footswitches.
  await gateThreshold.press('ArrowUp');
  await channel1.click();
  await channel2.click();
  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Slots' }).click();
  await drawer.getByRole('button', { name: 'Slot 7 · MIDI only' }).click();
  await drawer.getByRole('button', { name: 'Send All + Store · CC 111' }).click();
  await drawer.getByRole('button', { name: 'Overwrite Slot 07? Click again' }).click();
  await expect(rail.getByRole('button', { name: 'Recall Slot 7 · MIDI only · Untitled' })).toBeVisible();
  await expect(syncStatus).toHaveText('In Sync');
  await vol1.press('PageUp');
  await connection.getByLabel('MIDI channel').selectOption('5');
  await expect.poll(async () => (await savedSession(page))?.midiChannel).toBe(5);

  await page.reload();

  await expect(syncStatus).toHaveText('Possibly Stale');
  await expect(vol1).toHaveAttribute('aria-valuenow', '84');
  await expect(ampType.getByRole('radio', { name: '800' })).toBeChecked();
  await expect(gateThreshold).toHaveAttribute('aria-valuenow', '65');
  await expect(channel1).toContainText('Channel 1 Bypass · Engaged');
  await expect(channel2).toContainText('Channel 2 Bypass · Bypassed');
  await expect(connection.getByLabel('MIDI channel')).toHaveValue('5');
  await expect(connection.getByLabel('Working State')).toHaveText('Untitled •');
  await expect(rail.getByRole('button', { name: 'Recall Slot 7 · MIDI only · Untitled' })).toBeVisible();
  await expect(drawer.getByRole('tab', { name: 'Slots' })).toHaveAttribute('aria-selected', 'true');
});

test('settings apply at once and are kept between sessions', async ({ page }) => {
  await page.goto('/');
  const connection = page.getByRole('banner', { name: 'Connection' });
  const editor = page.getByRole('region', { name: 'Editor' });
  const footswitch = editor.getByRole('button', { name: 'Channel 1 Bypass', exact: true });
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const layoutScale = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--layout-scale'));

  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Settings' }).click();
  await expect(footswitch).toContainText('CC 102');
  await drawer.getByLabel('Show CC numbers').uncheck();
  await expect(footswitch).not.toContainText('CC 102');

  // Without confirmation, Store overwrites on the first click.
  await drawer.getByLabel('Confirm before overwrite').uncheck();
  await connection.getByRole('button', { name: /^Store to/ }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('CC 111 = 1 → stored in Slot 1');

  const before = Number(await layoutScale());
  await drawer.getByLabel('UI scale').fill('150');
  await expect.poll(async () => Number(await layoutScale())).toBeCloseTo(before * 1.5);
  await drawer.getByLabel('Send throttle').fill('10');
  await drawer.getByLabel('Auto Send All on connect').uncheck();
  await expect.poll(async () => (await savedSession(page))?.settings).toMatchObject({ sendThrottleMs: 10, autoSendAll: false });

  await page.reload();

  await expect(footswitch).not.toContainText('CC 102');
  expect(Number(await layoutScale())).toBeCloseTo(before * 1.5);
  await expect(drawer.getByLabel('Show CC numbers')).not.toBeChecked();
  await expect(drawer.getByLabel('Confirm before overwrite')).not.toBeChecked();
  await expect(drawer.getByLabel('Auto Send All on connect')).not.toBeChecked();
  await expect(drawer.getByLabel('Send throttle')).toHaveValue('10');
  await expect(drawer.getByLabel('UI scale')).toHaveValue('150');
  await expect(connection.getByLabel('Send All on connect')).not.toBeChecked();
});

test('a theme recolours the editor at once and is kept between sessions', async ({ page }) => {
  await page.goto('/');
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const paper = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const themeColor = page.locator('meta[name="theme-color"]');

  expect(await paper()).toBe('rgb(243, 239, 230)');
  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Settings' }).click();
  await drawer.getByLabel('Theme').selectOption('Charcoal (dark)');
  await expect.poll(paper).toBe('rgb(42, 45, 46)');
  await expect(themeColor).toHaveAttribute('content', '#2a2d2e');
  await expect.poll(async () => (await savedSession(page))?.settings).toMatchObject({ theme: 'charcoal' });

  await page.reload();

  await expect.poll(paper).toBe('rgb(42, 45, 46)');
  await expect(drawer.getByLabel('Theme')).toHaveValue('charcoal');
});

test('the editor stores its data under its own names', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('complementary', { name: 'Data' }).getByRole('tab', { name: 'Library' }).click();

  const databases = () => page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name).sort());
  await expect.poll(databases).toEqual(['brothers-82-library', 'brothers-82-session']);
  expect(await page.evaluate(() => Object.keys(localStorage))).toContain('brothers-82-layout');
});
