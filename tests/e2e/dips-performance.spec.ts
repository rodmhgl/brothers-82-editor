import { expect, test, type Page } from '@playwright/test';

// The folder picker can't be driven in a test, so it hands back a folder in the browser's private file system.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('My Presets', { create: true });
  });
});

/** The only Preset file in the Library folder, parsed. */
async function readOnlyPresetFile(page: Page) {
  return page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('My Presets');
    const files: File[] = [];
    for await (const handle of folder.values()) if (handle.kind === 'file') files.push(await handle.getFile());
    if (files.length !== 1) throw new Error(`expected one Preset file, found ${files.length}`);
    return JSON.parse(await files[0]!.text());
  });
}

async function saveAs(page: Page, name: string) {
  const drawer = page.getByRole('complementary', { name: 'Data' });
  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Library' }).click();
  await drawer.getByRole('button', { name: 'Choose folder…' }).click();
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await drawer.getByRole('form', { name: 'Save As' }).getByLabel('Preset name').fill(name);
  await drawer.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('banner', { name: 'Connection' }).getByLabel('Working State')).toHaveText(name);
  await page.getByRole('button', { name: /^Data/ }).click();
  await expect(drawer).toHaveAttribute('inert');
}

test('both dip banks send their CCs and are stored in a Preset', async ({ page }) => {
  await page.goto('/');
  const dips = page.getByRole('region', { name: 'Dip switches' });
  const targets = dips.getByRole('group', { name: 'Expression / CV targets' });
  const customize = dips.getByRole('group', { name: 'Customize' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const last = pedal.getByRole('log').getByRole('listitem').last();

  await expect(targets.getByRole('switch')).toHaveText(['Volume 1', 'Volume 2', 'Gain 1', 'Gain 2', 'Tone 1', 'Tone 2', 'Sweep B', 'Polarity F']);
  await expect(customize.getByRole('switch')).toHaveText(['Noise Gate', 'Clean 1', 'MotoByp 1', 'MotoByp 2', 'Contour 2', 'Presence 2', 'Master']);

  await targets.getByRole('switch', { name: 'Tone 2 target' }).click();
  await expect(last).toHaveText('CC 66 = 127 → Tone 2 target → On');
  await customize.getByRole('switch', { name: 'Clean 1' }).click();
  await expect(last).toHaveText('CC 72 = 127 → Clean 1 → On');
  await expect(pedal.getByLabel('Dips on')).toHaveText('Tone 2 target, Clean 1');

  await saveAs(page, 'Clean Boost');
  expect((await readOnlyPresetFile(page)).params).toMatchObject({ tone2Target: 127, clean1: 127, contour2: 0, polarity: 0 });

  const drawer = page.getByRole('complementary', { name: 'Data' });
  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('button', { name: 'New' }).click();
  await expect(targets.getByRole('switch', { name: 'Tone 2 target' })).toHaveAttribute('aria-checked', 'false');
  await drawer.getByRole('list', { name: 'Presets' }).getByRole('button', { name: 'Recall Clean Boost' }).click();
  await expect(targets.getByRole('switch', { name: 'Tone 2 target' })).toHaveAttribute('aria-checked', 'true');
  await expect(customize.getByRole('switch', { name: 'Clean 1' })).toHaveAttribute('aria-checked', 'true');
  await expect(pedal.getByLabel('Dips on')).toHaveText('Tone 2 target, Clean 1');
});

test('Gate Threshold and Gate Release are decoded by the Virtual Pedal', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Hidden Options' });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  await panel.getByRole('slider', { name: 'Gate Threshold' }).press('ArrowUp');
  await expect(last).toHaveText('CC 29 = 65 → Gate Threshold');
  await panel.getByRole('slider', { name: 'Gate Release' }).press('ArrowUp');
  await expect(last).toHaveText('CC 27 = 65 → Gate Release');
});

test('Expression is sent live, never stored or sent by Send All', async ({ page }) => {
  await page.goto('/');
  const performance = page.getByRole('region', { name: 'Performance' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');

  await performance.getByRole('slider', { name: 'Expression' }).fill('40');
  await expect(log.getByRole('listitem').last()).toHaveText('CC 100 = 40 → Expression');

  await saveAs(page, 'Moving');
  expect((await readOnlyPresetFile(page)).params).not.toHaveProperty('expression');

  const expressionLines = log.getByRole('listitem').filter({ hasText: /→ Expression/ });
  await expect(expressionLines).toHaveCount(1);
  await page.getByRole('banner', { name: 'Connection' }).getByRole('button', { name: 'Send All' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText(/^CC 103 = /);
  await expect(expressionLines).toHaveCount(1);
});
