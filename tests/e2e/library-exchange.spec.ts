import { expect, test, type Page } from '@playwright/test';

/** Opens the Library tab in the Data drawer. */
async function openLibrary(page: Page) {
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const toggle = page.getByRole('button', { name: /^Data/ });
  // The drawer stays open across a reload.
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  await drawer.getByRole('tab', { name: 'Library' }).click();
  return drawer;
}

/** Saves the Working State as a new Preset. */
async function saveAs(page: Page, name: string) {
  const drawer = page.getByRole('complementary', { name: 'Data' });
  await drawer.getByRole('button', { name: 'Save As…' }).click();
  await drawer.getByLabel('Preset name').fill(name);
  await drawer.getByLabel('Preset name').press('Enter');
  await expect(page.getByRole('banner', { name: 'Connection' }).getByLabel('Working State')).toHaveText(name);
}

test.describe('without folder access', () => {
  // As in Firefox or Safari: no File System Access API, so the Library lives in IndexedDB.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      delete (Window.prototype as { showDirectoryPicker?: unknown }).showDirectoryPicker;
      delete (window as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    });
  });

  test('keeps the Library in browser storage across reloads and reminds the user to back it up', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByRole('region', { name: 'Editor' });
    let drawer = await openLibrary(page);
    const presets = drawer.getByRole('list', { name: 'Presets' });

    await expect(drawer.getByText('Browser storage · kept in this browser only')).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Choose folder…' })).toHaveCount(0);
    await expect(drawer.getByRole('status', { name: 'Back up your Library' })).toHaveCount(0);
    // No Factory Presets: a new Library starts empty.
    await expect(presets.getByRole('button', { name: /^Recall/ })).toHaveCount(0);
    await expect(presets.getByRole('listitem')).toHaveText('No Presets in this Library yet.');

    await editor.getByRole('slider', { name: 'Vol 1', exact: true }).press('PageUp');
    await saveAs(page, 'Shimmer Tape');
    await expect(presets.getByRole('button', { name: /^Recall/ })).toHaveText(['Shimmer Tape']);

    // A Library only this browser holds asks to be backed up; "Later" puts it off.
    const reminder = drawer.getByRole('status', { name: 'Back up your Library' });
    await expect(reminder).toBeVisible();
    await reminder.getByRole('button', { name: 'Later' }).click();
    await expect(reminder).toHaveCount(0);

    await page.reload();
    drawer = await openLibrary(page);
    await expect(drawer.getByRole('list', { name: 'Presets' }).getByRole('button', { name: /^Recall/ })).toHaveText([
      'Shimmer Tape',
    ]);
    await expect(drawer.getByRole('status', { name: 'Back up your Library' })).toHaveCount(0);

    // A Bundle backs up the browser's Library and imports back into it.
    const download = page.waitForEvent('download');
    await drawer.getByRole('button', { name: 'Export Bundle' }).click();
    await drawer.getByLabel('Import Preset or Bundle files').setInputFiles(await (await download).path());
    await expect(drawer.getByRole('status', { name: 'Import' })).toContainText('0 added · 1 already in the Library');

    await drawer.getByRole('button', { name: 'Recall Shimmer Tape' }).click();
    await expect(page.getByRole('region', { name: 'Virtual Pedal' }).getByLabel('Vol 1', { exact: true })).toHaveText('74');
  });
});

test.describe('with a Library folder', () => {
  // As in library.spec.ts: the folder picker hands back a folder in the browser's private file system.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.showDirectoryPicker = async () =>
        (await navigator.storage.getDirectory()).getDirectoryHandle('My Presets', { create: true });
    });
  });

  test('a Bundle export and import round-trips the Library, asking about Presets already in it', async ({ page }) => {
    await page.goto('/');
    const editor = page.getByRole('region', { name: 'Editor' });
    const drawer = await openLibrary(page);
    const presets = drawer.getByRole('list', { name: 'Presets' });
    const names = presets.getByRole('button', { name: /^Recall/ });
    await drawer.getByRole('button', { name: 'Choose folder…' }).click();

    await editor.getByRole('slider', { name: 'Vol 1', exact: true }).press('PageUp');
    await saveAs(page, 'Ambience');
    await drawer.getByRole('button', { name: 'New' }).click();
    await editor.getByRole('slider', { name: 'Tone 1' }).press('PageDown');
    await saveAs(page, 'Echo');
    await expect(names).toHaveText(['Ambience', 'Echo']);

    const download = page.waitForEvent('download');
    await drawer.getByRole('button', { name: 'Export Bundle' }).click();
    const bundle = await download;
    expect(bundle.suggestedFilename()).toMatch(/^my-presets-\d{4}-\d{2}-\d{2}\.b82bundle\.json$/);
    const bundlePath = await bundle.path();

    for (const name of ['Ambience', 'Echo']) {
      await presets.getByRole('button', { name: `Delete ${name}` }).click();
      await presets.getByRole('button', { name: `Delete ${name}? Click again` }).click();
    }
    await expect(names).toHaveCount(0);

    const importInput = drawer.getByLabel('Import Preset or Bundle files');
    await importInput.setInputFiles(bundlePath);
    await expect(names).toHaveText(['Ambience', 'Echo']);
    await expect(drawer.getByRole('status', { name: 'Import' })).toContainText('2 added');

    // Echo changed since the export: importing again skips Ambience and asks about Echo.
    const workingState = page.getByRole('banner', { name: 'Connection' }).getByLabel('Working State');
    await drawer.getByRole('button', { name: 'Recall Echo' }).click();
    await editor.getByRole('slider', { name: 'Vol 1', exact: true }).press('PageUp');
    await expect(workingState).toHaveText('Echo •');
    await drawer.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(workingState).toHaveText('Echo');
    await importInput.setInputFiles(bundlePath);
    const conflict = drawer.getByRole('alertdialog', { name: 'Import conflict' });
    await expect(conflict).toContainText('“Echo” is already in the Library');
    await conflict.getByRole('button', { name: 'Replace' }).click();
    await expect(conflict).toHaveCount(0);
    await expect(drawer.getByRole('status', { name: 'Import' })).toContainText(
      '0 added · 1 replaced · 1 already in the Library',
    );
    await expect(names).toHaveText(['Ambience', 'Echo']);
    // The Working State still holds the edit, now modified from the replaced Preset.
    await expect(workingState).toHaveText('Echo •');
  });

  test('another pedal’s files and newer files are refused, not imported', async ({ page }) => {
    await page.goto('/');
    const drawer = await openLibrary(page);
    await drawer.getByRole('button', { name: 'Choose folder…' }).click();

    const json = (name: string, file: object) => ({
      name,
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await drawer.getByLabel('Import Preset or Bundle files').setInputFiles([
      json('glass.cleanpreset.json', { format: 'clean-preset', schemaVersion: 1, id: 'c-1', name: 'Glass', params: {} }),
      json('shared.cleanbundle.json', { format: 'clean-bundle', schemaVersion: 1, presets: [] }),
      json('shimmer.lfpreset.json', { format: 'lost-found-preset', schemaVersion: 1, id: 'lf-1', name: 'Shimmer', params: {} }),
      json('future.b82preset.json', { format: 'brothers-82-preset', schemaVersion: 2, id: 'f-1', name: 'Future', params: {} }),
    ]);

    const report = drawer.getByRole('status', { name: 'Import' });
    await expect(report).toContainText('0 added');
    await report.getByText('4 import problems').click();
    for (const problem of [
      'glass.cleanpreset.json: This is a Clean Preset, open it in the Clean editor',
      'shared.cleanbundle.json: This is a Clean Bundle, open it in the Clean editor',
      'shimmer.lfpreset.json: This is a Lost+Found Preset, open it in the Lost+Found editor',
      'future.b82preset.json: Made by a newer version of the editor, please update',
    ]) {
      await expect(report).toContainText(problem);
    }
    await expect(drawer.getByRole('list', { name: 'Presets' }).getByRole('button', { name: /^Recall/ })).toHaveCount(0);
  });
});
