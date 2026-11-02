import { expect, test } from '@playwright/test';

// The Hidden Options grid (SPEC.md §5.5): each Hidden Option sits where its host control does, Ramp Speed beside it.

test('each Hidden Option sits where its host control does, with Ramp Speed beside the grid', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Hidden Options' });
  const centre = async (name: string, role: 'slider' | 'group') => {
    const box = (await panel.getByRole(role, { name, exact: role === 'slider' }).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const [gateRelease, gateThreshold, swellIn, userRelease, envelopeBalance, swellOut] = await Promise.all(
    ['Gate Release', 'Gate Threshold', 'Swell In', 'User Release', 'Envelope Balance', 'Swell Out'].map((n) =>
      centre(n, 'slider'),
    ),
  );
  // Within a pixel: the knobs' boxes can differ by a fraction.
  const aligned = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1);
  for (const [left, right] of [
    [gateRelease, gateThreshold],
    [gateThreshold, swellIn],
    [userRelease, envelopeBalance],
    [envelopeBalance, swellOut],
  ]) {
    expect(left!.x).toBeLessThan(right!.x);
    aligned(left!.y, right!.y);
  }
  for (const [top, bottom] of [
    [gateRelease, userRelease],
    [gateThreshold, envelopeBalance],
    [swellIn, swellOut],
  ]) {
    expect(top!.y).toBeLessThan(bottom!.y);
    aligned(top!.x, bottom!.x);
  }

  const [envelopeType, shiftyResponse, spreadRouting] = await Promise.all(
    ['Envelope Type', 'Shifty Response', 'Spread Routing'].map((n) => centre(n, 'group')),
  );
  expect(envelopeType!.x).toBeLessThan(shiftyResponse!.x);
  expect(shiftyResponse!.x).toBeLessThan(spreadRouting!.x);
  expect(envelopeType!.y).toBeGreaterThan(userRelease!.y);
  aligned(envelopeType!.y, spreadRouting!.y);

  const rampSpeed = await centre('Ramp Speed', 'slider');
  expect(rampSpeed.x).toBeGreaterThan(swellIn!.x);
  expect(rampSpeed.x).toBeGreaterThan(spreadRouting!.x);

  // Each toggle shows its value labels.
  const positions = (name: string) => panel.getByRole('group', { name }).locator('label');
  await expect(positions('Envelope Type')).toHaveText(['Analog', 'Combo', 'Adaptive']);
  await expect(positions('Shifty Response')).toHaveText(['ASR', 'Envelope']);
  await expect(positions('Spread Routing')).toHaveText(['EQ', 'Both', 'Volume']);
});

test('setting each Hidden Option is decoded by the Virtual Pedal', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const panel = editor.getByRole('region', { name: 'Hidden Options' });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  const knobs = [
    ['Gate Release', 24],
    ['Gate Threshold', 25],
    ['Swell In', 26],
    ['User Release', 27],
    ['Envelope Balance', 28],
    ['Swell Out', 29],
    ['Ramp Speed', 20],
  ] as const;
  for (const [name, cc] of knobs) {
    const knob = panel.getByRole('slider', { name, exact: true });
    const sent = Number(await knob.getAttribute('aria-valuenow')) + 1;
    await knob.press('ArrowUp');
    await expect(last).toHaveText(`CC ${cc} = ${sent} → ${name}`);
  }

  // Shifty Response only matters in the Shifty EQ mode; elsewhere the Virtual Pedal notes it has no effect.
  await editor.getByRole('group', { name: 'Mode' }).getByRole('radio', { name: 'Shifty' }).check();
  const toggles = [
    ['Envelope Type', 'Combo', 'CC 31 = 2'],
    ['Envelope Type', 'Adaptive', 'CC 31 = 3'],
    ['Envelope Type', 'Analog', 'CC 31 = 1'],
    ['Shifty Response', 'ASR', 'CC 32 = 0'],
    ['Shifty Response', 'Envelope', 'CC 32 = 3'],
    ['Spread Routing', 'EQ', 'CC 33 = 1'],
    ['Spread Routing', 'Volume', 'CC 33 = 3'],
    ['Spread Routing', 'Both', 'CC 33 = 2'],
  ] as const;
  for (const [name, position, message] of toggles) {
    await panel.getByRole('group', { name }).getByRole('radio', { name: position }).check();
    await expect(last).toHaveText(`${message} → ${name} → ${position}`);
  }
});

test('Ctrl+H moves focus to the first Hidden Option', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Connection' }).getByLabel('Connection status')).toHaveText('Connected');
  await page.keyboard.press('Control+H');
  await expect(page.getByRole('region', { name: 'Hidden Options' }).getByRole('slider', { name: 'Gate Release' })).toBeFocused();
});
