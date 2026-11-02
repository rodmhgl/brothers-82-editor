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
  const targets = dips.getByRole('group', { name: 'Ramp / Expression targets' });
  const customize = dips.getByRole('group', { name: 'Customize' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const last = pedal.getByRole('log').getByRole('listitem').last();

  await expect(targets.getByRole('switch')).toHaveText(['Dyn', 'Attack', 'EQ', 'Dry', 'Wet', 'Bounce', 'Sweep B', 'Pol F']);
  await expect(customize.getByRole('switch')).toHaveText(['Miso', 'Spread', 'Latch', 'Side', 'Gate', 'Motion', 'Swell Aux', 'Dusty']);

  await targets.getByRole('switch', { name: 'Bounce' }).click();
  await expect(last).toHaveText('CC 66 = 127 → Bounce → On');
  await customize.getByRole('switch', { name: 'Miso' }).click();
  await expect(last).toHaveText('CC 71 = 127 → Miso → On');
  await expect(pedal.getByLabel('Dips on')).toHaveText('Bounce, Miso');

  await saveAs(page, 'Wide Bounce');
  expect((await readOnlyPresetFile(page)).params).toMatchObject({ bounce: 127, miso: 127, motion: 0, polarity: 0 });

  const drawer = page.getByRole('complementary', { name: 'Data' });
  await page.getByRole('button', { name: /^Data/ }).click();
  await drawer.getByRole('button', { name: 'New' }).click();
  await expect(targets.getByRole('switch', { name: 'Bounce' })).toHaveAttribute('aria-checked', 'false');
  await drawer.getByRole('list', { name: 'Presets' }).getByRole('button', { name: 'Recall Wide Bounce' }).click();
  await expect(targets.getByRole('switch', { name: 'Bounce' })).toHaveAttribute('aria-checked', 'true');
  await expect(customize.getByRole('switch', { name: 'Miso' })).toHaveAttribute('aria-checked', 'true');
  await expect(pedal.getByLabel('Dips on')).toHaveText('Bounce, Miso');
});

test('Dynamics Max is momentary, latches on shift-click whatever Latch says, and is never stored', async ({ page }) => {
  await page.goto('/');
  const performance = page.getByRole('region', { name: 'Performance' });
  const dynamicsMax = performance.getByRole('button', { name: 'Dynamics Max' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const last = log.getByRole('listitem').last();

  // Latch on the pedal only changes the AUX footswitch.
  await page.getByRole('region', { name: 'Dip switches' }).getByRole('switch', { name: 'Latch' }).click();

  // Momentary: on while held; pressing and leaving with the keyboard (blur) lets go too.
  await dynamicsMax.focus();
  await page.keyboard.down('Enter');
  await expect(last).toHaveText('CC 106 = 127 → Dynamics Max → On');
  await expect(dynamicsMax).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(last).toHaveText('CC 106 = 0 → Dynamics Max → Off');
  await page.keyboard.up('Enter');
  await expect(dynamicsMax).toHaveAttribute('aria-pressed', 'false');

  // Latched: shift-click holds it on through release and blur, until it is clicked again.
  await dynamicsMax.click({ modifiers: ['Shift'] });
  await expect(last).toHaveText('CC 106 = 127 → Dynamics Max → On');
  await expect(dynamicsMax).toHaveAttribute('aria-pressed', 'true');
  await expect(dynamicsMax).toContainText('latched');
  await page.getByRole('region', { name: 'Editor' }).getByRole('slider', { name: 'Sensitivity' }).focus();
  await expect(dynamicsMax).toHaveAttribute('aria-pressed', 'true');
  await expect(log.getByText('CC 106 = 0 → Dynamics Max → Off')).toHaveCount(1);

  await saveAs(page, 'Sag');
  expect((await readOnlyPresetFile(page)).params).not.toHaveProperty('dynamicsMax');

  await dynamicsMax.click();
  await expect(last).toHaveText('CC 106 = 0 → Dynamics Max → Off');
  await expect(dynamicsMax).toHaveAttribute('aria-pressed', 'false');
  await expect(dynamicsMax).not.toContainText('latched');
});

test('Expression and Ramping are sent live, never stored or sent by Send All', async ({ page }) => {
  await page.goto('/');
  const performance = page.getByRole('region', { name: 'Performance' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');

  await performance.getByRole('slider', { name: 'Expression' }).fill('40');
  await expect(log.getByRole('listitem').last()).toHaveText('CC 100 = 40 → Expression');
  await performance.getByRole('button', { name: /Ramping/ }).click();
  await expect(log.getByRole('listitem').last()).toHaveText('CC 52 = 127 → Ramping → On');

  await saveAs(page, 'Moving');
  const params = (await readOnlyPresetFile(page)).params;
  expect(params).not.toHaveProperty('expression');
  expect(params).not.toHaveProperty('ramping');

  const performanceLines = log.getByRole('listitem').filter({ hasText: /→ (Expression|Ramping|Dynamics Max)/ });
  await expect(performanceLines).toHaveCount(2);
  await page.getByRole('banner', { name: 'Connection' }).getByRole('button', { name: 'Send All' }).click();
  await expect(log.getByRole('listitem').last()).toHaveText(/^CC 103 = /);
  await expect(performanceLines).toHaveCount(2);
});

test('the Virtual Pedal log notes what dips and Shifty Response do', async ({ page }) => {
  await page.goto('/');
  const dips = page.getByRole('region', { name: 'Dip switches' });
  const editor = page.getByRole('region', { name: 'Editor' });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  await dips.getByRole('switch', { name: 'EQ target' }).click();
  await expect(last).toHaveText('CC 63 = 127 → EQ target → On · Ramping engaged: SENSITIVITY knob now sets ramp speed');
  await dips.getByRole('switch', { name: 'Wet target' }).click();
  await expect(last).toHaveText('CC 65 = 127 → Wet target → On');

  await dips.getByRole('switch', { name: 'Dusty' }).click();
  await expect(last).toHaveText('CC 78 = 127 → Dusty → On · Dusty: limiter is now an overdrive');
  await dips.getByRole('switch', { name: 'Sidechain' }).click();
  await expect(last).toHaveText('CC 74 = 127 → Sidechain → On · Sidechain: following the external input');
  await dips.getByRole('switch', { name: 'Swell Aux' }).click();
  await expect(last).toHaveText('CC 77 = 127 → Swell Aux → On · Swell Aux: AUX now triggers manual swells');

  // Mode starts in Manual, so Shifty Response does nothing yet.
  const shiftyResponse = editor.getByRole('group', { name: /Shifty Response/ });
  await shiftyResponse.getByRole('radio', { name: 'ASR' }).check();
  await expect(last).toHaveText(
    'CC 32 = 0 → Shifty Response → ASR · Shifty Response has no effect outside the Shifty EQ mode',
  );
  await editor.getByRole('group', { name: 'Mode' }).getByRole('radio', { name: 'Shifty' }).check();
  await shiftyResponse.getByRole('radio', { name: 'Envelope' }).check();
  await expect(last).toHaveText('CC 32 = 3 → Shifty Response → Envelope');
});
