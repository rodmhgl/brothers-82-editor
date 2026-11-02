import { expect, test, type Page } from '@playwright/test';

// The folder picker can't be driven in a test, so it hands back a folder in the browser's private file
// system: a real FileSystemDirectoryHandle, so the editor's File System Access code runs unchanged.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('My Presets', { create: true });
  });
});

/** A file in the Library folder, parsed. */
async function readPresetFile(page: Page, fileName: string) {
  return page.evaluate(async (name) => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('My Presets');
    return JSON.parse(await (await (await folder.getFileHandle(name)).getFile()).text());
  }, fileName);
}

/** The file names in the Library folder. */
async function listFiles(page: Page) {
  return page.evaluate(async () => {
    const folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('My Presets');
    const names: string[] = [];
    for await (const handle of folder.values()) names.push(handle.name);
    return names.sort();
  });
}

test('save, edit and recall round-trip the Working State and the Virtual Pedal', async ({ page }) => {
  await page.goto('/');
  const connection = page.getByRole('banner', { name: 'Connection' });
  const workingState = connection.getByLabel('Working State');
  const editor = page.getByRole('region', { name: 'Editor' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const presets = drawer.getByRole('list', { name: 'Presets' });
  const release = editor.getByRole('group', { name: 'Release' });

  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Library' }).click();
  await drawer.getByRole('button', { name: 'Choose folder…' }).click();
  await expect(drawer.getByText('Folder · My Presets')).toBeVisible();
  await expect(workingState).toHaveText('Untitled');

  // Edit, then Save: the Working State has no Preset yet, so Save asks for a name.
  await release.getByRole('radio', { name: 'Fast' }).check();
  await editor.getByRole('slider', { name: 'EQ', exact: true }).press('PageUp');
  await editor.getByRole('button', { name: 'Swell', exact: true }).click();
  await page.getByRole('region', { name: 'Dip switches' }).getByRole('switch', { name: 'Dusty' }).press('Space');
  await expect(workingState).toHaveText('Untitled •');
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  await drawer.getByRole('form', { name: 'Save As' }).getByLabel('Preset name').fill('Shimmer Tape');
  await drawer.getByRole('button', { name: 'OK' }).click();

  await expect(workingState).toHaveText('Shimmer Tape');
  await expect(presets.getByRole('listitem')).toHaveCount(1);
  await expect(presets.getByLabel('Customize dips')).toHaveText('Dusty');
  const file = await readPresetFile(page, 'shimmer-tape.cleanpreset.json');
  expect(file).toMatchObject({ format: 'clean-preset', schemaVersion: 1, name: 'Shimmer Tape' });
  expect(file.params).toMatchObject({ release: 1, eq: 74, swell: 127, dusty: 127 });
  expect(file.params).not.toHaveProperty('expression');

  // Further edits mark it modified; New replaces it with the defaults.
  await editor.getByRole('slider', { name: 'EQ', exact: true }).press('PageUp');
  await expect(workingState).toHaveText('Shimmer Tape •');
  await drawer.getByRole('button', { name: 'New' }).click();
  await expect(workingState).toHaveText('Untitled');
  await expect(pedal.getByLabel('EQ', { exact: true })).toHaveText('64');
  await expect(pedal.getByLabel('Swell LED')).toHaveText('Off');

  // Recall brings back the saved Working State, not the unsaved edit, and sends it.
  await presets.getByRole('button', { name: 'Recall Shimmer Tape' }).click();
  await expect(workingState).toHaveText('Shimmer Tape');
  await expect(editor.getByRole('slider', { name: 'EQ', exact: true })).toHaveAttribute('aria-valuenow', '74');
  await expect(release.getByRole('radio', { name: 'Fast' })).toBeChecked();
  await expect(pedal.getByLabel('EQ', { exact: true })).toHaveText('74');
  await expect(pedal.getByLabel('Swell LED')).toHaveText('On');
  await expect(pedal.getByLabel('Release')).toHaveText('Fast');
  await expect(connection.getByLabel('Sync Status')).toHaveText('In Sync');
});

test('Rename, Duplicate and Delete change the Library folder', async ({ page }) => {
  await page.goto('/');
  const workingState = page.getByRole('banner', { name: 'Connection' }).getByLabel('Working State');
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const presets = drawer.getByRole('list', { name: 'Presets' });

  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Library' }).click();
  await drawer.getByRole('button', { name: 'Choose folder…' }).click();
  await drawer.getByRole('button', { name: 'Save As…' }).click();
  await drawer.getByLabel('Preset name').fill('Shimmer Tape');
  await drawer.getByLabel('Preset name').press('Enter');
  await expect(workingState).toHaveText('Shimmer Tape');

  await presets.getByRole('button', { name: 'Rename Shimmer Tape' }).click();
  await presets.getByLabel('Preset name').fill('Glass Choir');
  await presets.getByLabel('Preset name').press('Enter');
  await expect(workingState).toHaveText('Glass Choir');
  expect((await readPresetFile(page, 'glass-choir.cleanpreset.json')).name).toBe('Glass Choir');

  await presets.getByRole('button', { name: 'Duplicate Glass Choir' }).click();
  await expect(presets.getByRole('button', { name: /^Recall/ })).toHaveText(['Glass Choir', 'Glass Choir copy']);

  await presets.getByRole('button', { name: 'Delete Glass Choir copy' }).click();
  await presets.getByRole('button', { name: 'Delete Glass Choir copy? Click again' }).click();
  await expect(presets.getByRole('button', { name: /^Recall/ })).toHaveText(['Glass Choir']);
  expect(await listFiles(page)).toEqual(['glass-choir.cleanpreset.json']);
});

test('the Factory Presets are listed before any folder is chosen, and recall and duplicate', async ({ page }) => {
  await page.goto('/');
  const workingState = page.getByRole('banner', { name: 'Connection' }).getByLabel('Working State');
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const factory = drawer.getByRole('list', { name: 'Factory', exact: true });

  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('tab', { name: 'Library' }).click();
  await expect(factory.getByRole('button', { name: /^Recall / })).toHaveText(['Factory Left', 'Factory Right']);
  await expect(factory.getByRole('button', { name: 'Duplicate Factory Left' })).toBeDisabled();
  await expect(factory.getByRole('button', { name: 'Rename Factory Left' })).toHaveCount(0);
  await expect(factory.getByRole('button', { name: 'Delete Factory Left' })).toHaveCount(0);

  await factory.getByRole('button', { name: 'Recall Factory Right' }).click();
  await expect(workingState).toContainText('Factory Right');
  await expect(pedal.getByLabel('Mode')).toHaveText('Modulated');

  await drawer.getByRole('button', { name: 'Choose folder…' }).click();
  await factory.getByRole('button', { name: 'Duplicate Factory Left' }).click();
  await expect(drawer.getByRole('list', { name: 'Presets' }).getByRole('button', { name: /^Recall / })).toHaveText([
    'Factory Left copy',
  ]);
  expect(await listFiles(page)).toEqual(['factory-left-copy.cleanpreset.json']);
});
