import { expect, test } from '@playwright/test';

// The main panel, laid out as on the pedal (SPEC.md §5.4): every control reaches the Virtual Pedal.

test('the knobs, toggles and footswitches sit as they do on the pedal', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const centre = async (name: string, role: 'slider' | 'group' | 'button') => {
    const box = (await panel.getByRole(role, { name, exact: role !== 'group' }).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const [dynamics, sensitivity, wet, attack, eq, dry] = await Promise.all(
    ['Dynamics', 'Sensitivity', 'Wet', 'Attack', 'EQ', 'Dry'].map((n) => centre(n, 'slider')),
  );
  // Within a pixel: the knobs' boxes can differ by a fraction.
  const aligned = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1);
  for (const [left, right] of [[dynamics, sensitivity], [sensitivity, wet], [attack, eq], [eq, dry]]) {
    expect(left!.x).toBeLessThan(right!.x);
    aligned(left!.y, right!.y);
  }
  expect(dynamics!.y).toBeLessThan(attack!.y);
  aligned(dynamics!.x, attack!.x);

  const [release, mode, physics] = await Promise.all(['Release', 'Mode', 'Physics'].map((n) => centre(n, 'group')));
  expect(release!.x).toBeLessThan(mode!.x);
  expect(mode!.x).toBeLessThan(physics!.x);
  expect(release!.y).toBeGreaterThan(attack!.y);
  await expect(panel.getByRole('group', { name: 'Release' }).getByRole('radio', { name: 'User' })).toBeChecked();

  const [swell, bypass] = await Promise.all(['Swell', 'Bypass'].map((n) => centre(n, 'button')));
  expect(swell!.x).toBeLessThan(bypass!.x);
  expect(swell!.y).toBeGreaterThan(release!.y);
  await expect(panel.getByRole('button', { name: 'Bypass' })).toContainText('Bypass · Engaged');
  await expect(panel.getByRole('button', { name: 'Swell' })).toContainText('Swell · Off');

  // EQ is bipolar and reads "flat" at noon.
  await expect(panel.getByRole('slider', { name: 'EQ' })).toHaveAttribute('aria-valuetext', 'flat');
  await panel.getByRole('slider', { name: 'EQ' }).press('ArrowUp');
  await expect(panel.getByRole('slider', { name: 'EQ' })).not.toHaveAttribute('aria-valuetext');
});

test('the Working State name shows with its modified marker', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const name = panel.getByRole('heading', { name: /^Working State/ });

  await expect(name).toHaveText('Working State: Untitled');
  await panel.getByRole('slider', { name: 'Wet' }).press('ArrowUp');
  await expect(name).toHaveText('Working State: Untitled •');
});

test('the preset toggle strip recalls the Toggle Slots and goes Live', async ({ page }) => {
  await page.goto('/');
  const strip = page.getByRole('region', { name: 'Pedal' }).getByRole('group', { name: 'Preset toggle' });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  await expect(strip.getByRole('button')).toHaveText(['Slot 2 · Toggle Left', 'Live', 'Slot 1 · Toggle Right']);
  await strip.getByRole('button', { name: 'Slot 2 · Toggle Left' }).click();
  await expect(last).toContainText('PC 2');
  await strip.getByRole('button', { name: 'Live' }).click();
  await expect(last).toContainText('PC 0');
  await strip.getByRole('button', { name: 'Slot 1 · Toggle Right' }).click();
  await expect(last).toContainText('PC 1');
});

test('B toggles Bypass and W toggles Swell, as stored footswitch states', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Connection' }).getByLabel('Connection status')).toHaveText('Connected');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const last = pedal.getByRole('log').getByRole('listitem').last();
  const bypass = panel.getByRole('button', { name: 'Bypass' });
  const swell = panel.getByRole('button', { name: 'Swell' });

  await expect(bypass).toHaveAttribute('aria-keyshortcuts', 'B');
  await expect(swell).toHaveAttribute('aria-keyshortcuts', 'W');

  await page.keyboard.press('b');
  await expect(last).toHaveText('CC 102 = 0 → Bypass → Off');
  await expect(bypass).toHaveAttribute('aria-pressed', 'false');
  await expect(pedal.getByLabel('Bypass LED')).toHaveText('Off');
  await page.keyboard.press('B');
  await expect(last).toHaveText('CC 102 = 127 → Bypass → On');

  await page.keyboard.press('w');
  await expect(last).toHaveText('CC 103 = 127 → Swell → On');
  await expect(swell).toHaveAttribute('aria-pressed', 'true');
  await expect(pedal.getByLabel('Swell LED')).toHaveText('On');

  // An edit like any other: undo puts Swell back.
  await page.keyboard.press('Control+Z');
  await expect(swell).toHaveAttribute('aria-pressed', 'false');

  // Typed into a field, B and W are just letters.
  await page.getByRole('combobox', { name: 'MIDI input' }).focus();
  await page.keyboard.press('w');
  await expect(swell).toHaveAttribute('aria-pressed', 'false');
});

test('dragging Sensitivity changes the Virtual Pedal decoded Sensitivity and log', async ({ page }) => {
  await page.goto('/');
  const knob = page.getByRole('region', { name: 'Pedal' }).getByRole('slider', { name: 'Sensitivity' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const log = pedal.getByRole('log');

  await expect(pedal.getByLabel('Sensitivity')).toHaveText('77');
  await expect(log.getByRole('listitem')).toHaveCount(0);

  const box = (await knob.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 6 });
  await page.mouse.up();

  const sent = await knob.getAttribute('aria-valuenow');
  expect(Number(sent)).toBeGreaterThan(77);
  await expect(pedal.getByLabel('Sensitivity')).toHaveText(sent!);
  await expect(log.getByRole('listitem').last()).toHaveText(`CC 15 = ${sent} → Sensitivity`);
});

test('toggles, Hidden Options and footswitches are decoded by name', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const hidden = editor.getByRole('region', { name: 'Hidden Options' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const last = pedal.getByRole('log').getByRole('listitem').last();

  await editor.getByRole('group', { name: 'Mode' }).getByRole('radio', { name: 'Shifty' }).check();
  await expect(last).toHaveText('CC 22 = 1 → Mode → Shifty');
  await expect(pedal.getByLabel('Mode')).toHaveText('Shifty');

  await hidden.getByRole('group', { name: 'Shifty Response' }).getByRole('radio', { name: 'ASR' }).check();
  await expect(last).toHaveText('CC 32 = 0 → Shifty Response → ASR');
  await hidden.getByRole('group', { name: 'Envelope Type' }).getByRole('radio', { name: 'Combo' }).check();
  await expect(last).toHaveText('CC 31 = 2 → Envelope Type → Combo');
  await hidden.getByRole('group', { name: 'Spread Routing' }).getByRole('radio', { name: 'Volume' }).check();
  await expect(last).toHaveText('CC 33 = 3 → Spread Routing → Volume');

  await editor.getByRole('button', { name: 'Bypass' }).click();
  await expect(editor.getByRole('button', { name: 'Bypass' })).toContainText('Bypass · Bypassed');
  await expect(last).toHaveText('CC 102 = 0 → Bypass → Off');
  await expect(pedal.getByLabel('Bypass LED')).toHaveText('Off');
  await editor.getByRole('button', { name: 'Swell', exact: true }).click();
  await expect(last).toHaveText('CC 103 = 127 → Swell → On');
  await expect(pedal.getByLabel('Swell LED')).toHaveText('On');
});

test('EQ double-click resets to its noon detent', async ({ page }) => {
  await page.goto('/');
  const eq = page.getByRole('region', { name: 'Pedal' }).getByRole('slider', { name: 'EQ', exact: true });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  for (let i = 0; i < 5; i++) await eq.press('ArrowDown');
  await expect(eq).toHaveAttribute('aria-valuenow', '59');
  await eq.dblclick();
  await expect(eq).toHaveAttribute('aria-valuenow', '64');
  await expect(last).toHaveText('CC 18 = 64 → EQ');
});

test('Performance Controls send live: Dynamics Max while held, Ramping and Expression', async ({ page }) => {
  await page.goto('/');
  const performance = page.getByRole('region', { name: 'Performance' });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  const dynamicsMax = performance.getByRole('button', { name: 'Dynamics Max' });
  const box = (await dynamicsMax.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(last).toHaveText('CC 106 = 127 → Dynamics Max → On');
  await page.mouse.up();
  await expect(last).toHaveText('CC 106 = 0 → Dynamics Max → Off');

  await performance.getByRole('button', { name: /Ramping/ }).click();
  await expect(last).toHaveText('CC 52 = 127 → Ramping → On');

  await performance.getByRole('slider', { name: 'Expression' }).fill('90');
  await expect(last).toHaveText('CC 100 = 90 → Expression');
  await expect(performance.getByText('90', { exact: true })).toBeVisible();
});
