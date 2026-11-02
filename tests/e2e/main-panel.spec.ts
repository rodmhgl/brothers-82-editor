import { expect, test } from '@playwright/test';

// The main panel, laid out as on the pedal (SPEC.md §3.2, §5.4): every control reaches the Virtual Pedal.

test('the knobs, toggles and footswitches sit as they do on the pedal', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const centre = async (name: string, role: 'slider' | 'group' | 'button') => {
    const box = (await panel.getByRole(role, { name, exact: role !== 'group' }).boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };

  const [gain2, vol2, gain1, tone2, vol1, tone1] = await Promise.all(
    ['Gain 2', 'Vol 2', 'Gain 1', 'Tone 2', 'Vol 1', 'Tone 1'].map((n) => centre(n, 'slider')),
  );
  // Within a pixel: the knobs' boxes can differ by a fraction.
  const aligned = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1);
  for (const [left, right] of [[gain2, vol2], [vol2, gain1], [tone2, vol1], [vol1, tone1]]) {
    expect(left!.x).toBeLessThan(right!.x);
    aligned(left!.y, right!.y);
  }
  expect(gain2!.y).toBeLessThan(tone2!.y);
  aligned(gain2!.x, tone2!.x);

  const [ampType, effectOrder, odType] = await Promise.all(['Amp Type', 'Effect Order', 'OD Type'].map((n) => centre(n, 'group')));
  expect(ampType!.x).toBeLessThan(effectOrder!.x);
  expect(effectOrder!.x).toBeLessThan(odType!.x);
  expect(ampType!.y).toBeGreaterThan(tone2!.y);

  const positions = (name: string) => panel.getByRole('group', { name }).locator('label');
  await expect(positions('Amp Type')).toHaveText(['800', 'Plexi', 'Solo']);
  await expect(positions('Effect Order')).toHaveText(['2>1', '2+1', '2<1']);
  await expect(positions('OD Type')).toHaveText(['808', 'Super', 'RJM']);

  const [channel2, channel1] = await Promise.all(['Channel 2 Bypass', 'Channel 1 Bypass'].map((n) => centre(n, 'button')));
  expect(channel2!.x).toBeLessThan(channel1!.x);
  expect(channel2!.y).toBeGreaterThan(ampType!.y);
});

test('a new editor starts with knobs at 64, toggles in the middle, Channel 2 engaged and Channel 1 bypassed', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });

  for (const name of ['Gain 2', 'Vol 2', 'Gain 1', 'Tone 2', 'Vol 1', 'Tone 1']) {
    await expect(panel.getByRole('slider', { name, exact: true })).toHaveAttribute('aria-valuenow', '64');
    await expect(pedal.getByLabel(name, { exact: true })).toHaveText('64');
  }
  await expect(panel.getByRole('radio', { name: 'Plexi' })).toBeChecked();
  await expect(panel.getByRole('radio', { name: '2+1' })).toBeChecked();
  await expect(panel.getByRole('radio', { name: 'Super' })).toBeChecked();
  await expect(panel.getByRole('button', { name: 'Channel 2 Bypass' })).toContainText('Channel 2 Bypass · Engaged');
  await expect(panel.getByRole('button', { name: 'Channel 1 Bypass' })).toContainText('Channel 1 Bypass · Bypassed');
  await expect(pedal.getByLabel('Channel 2 Bypass LED')).toHaveText('On');
  await expect(pedal.getByLabel('Channel 1 Bypass LED')).toHaveText('Off');
});

test('New in the Library loads the same defaults', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const vol2 = panel.getByRole('slider', { name: 'Vol 2' });
  const channel1 = panel.getByRole('button', { name: 'Channel 1 Bypass' });

  await vol2.press('End');
  await panel.getByRole('radio', { name: 'Solo' }).check();
  await channel1.click();

  await page.getByRole('button', { name: /^Data/ }).click();
  await page.getByRole('complementary', { name: 'Data' }).getByRole('tab', { name: 'Library' }).click();
  await page.getByRole('complementary', { name: 'Data' }).getByRole('button', { name: 'New' }).click();

  await expect(vol2).toHaveAttribute('aria-valuenow', '64');
  await expect(panel.getByRole('radio', { name: 'Plexi' })).toBeChecked();
  await expect(channel1).toHaveAttribute('aria-pressed', 'false');
});

test('the Working State name shows with its modified marker', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const name = panel.getByRole('heading', { name: /^Working State/ });

  await expect(name).toHaveText('Working State: Untitled');
  await panel.getByRole('slider', { name: 'Gain 1' }).press('ArrowUp');
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

test('1 and 2 toggle Channel 1 Bypass and Channel 2 Bypass, as stored states', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Connection' }).getByLabel('Connection status')).toHaveText('Connected');
  const panel = page.getByRole('region', { name: 'Pedal' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const last = pedal.getByRole('log').getByRole('listitem').last();
  const channel1 = panel.getByRole('button', { name: 'Channel 1 Bypass' });
  const channel2 = panel.getByRole('button', { name: 'Channel 2 Bypass' });

  await expect(channel1).toHaveAttribute('aria-keyshortcuts', '1');
  await expect(channel2).toHaveAttribute('aria-keyshortcuts', '2');

  await page.keyboard.press('2');
  await expect(last).toHaveText('CC 103 = 0 → Channel 2 Bypass → Bypassed');
  await expect(channel2).toHaveAttribute('aria-pressed', 'false');
  await expect(pedal.getByLabel('Channel 2 Bypass LED')).toHaveText('Off');
  await page.keyboard.press('2');
  await expect(last).toHaveText('CC 103 = 127 → Channel 2 Bypass → Engaged');

  await page.keyboard.press('1');
  await expect(last).toHaveText('CC 102 = 127 → Channel 1 Bypass → Engaged');
  await expect(channel1).toHaveAttribute('aria-pressed', 'true');
  await expect(pedal.getByLabel('Channel 1 Bypass LED')).toHaveText('On');

  // An edit like any other: undo puts it back.
  await page.keyboard.press('Control+Z');
  await expect(channel1).toHaveAttribute('aria-pressed', 'false');

  // In a dropdown, 1 and 2 belong to the field.
  await page.getByRole('combobox', { name: 'MIDI input' }).focus();
  await page.keyboard.press('1');
  await expect(channel1).toHaveAttribute('aria-pressed', 'false');
});

test('Channel Bypass always latches, whatever the MotoByp dips say', async ({ page }) => {
  await page.goto('/');
  const channel1 = page.getByRole('region', { name: 'Pedal' }).getByRole('button', { name: 'Channel 1 Bypass' });
  await page.getByRole('region', { name: 'Dip switches' }).getByRole('switch', { name: 'MotoByp 1' }).click();

  await channel1.click();
  await expect(channel1).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(0, 0);
  await expect(channel1).toHaveAttribute('aria-pressed', 'true');
  await channel1.click();
  await expect(channel1).toHaveAttribute('aria-pressed', 'false');
});

test('dragging Vol 2 changes the Virtual Pedal decoded Vol 2 and log', async ({ page }) => {
  await page.goto('/');
  const knob = page.getByRole('region', { name: 'Pedal' }).getByRole('slider', { name: 'Vol 2' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const log = pedal.getByRole('log');

  await expect(pedal.getByLabel('Vol 2')).toHaveText('64');
  await expect(log.getByRole('listitem')).toHaveCount(0);

  const box = (await knob.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 6 });
  await page.mouse.up();

  const sent = await knob.getAttribute('aria-valuenow');
  expect(Number(sent)).toBeGreaterThan(64);
  await expect(pedal.getByLabel('Vol 2')).toHaveText(sent!);
  await expect(log.getByRole('listitem').last()).toHaveText(`CC 15 = ${sent} → Vol 2`);
});

test('toggles and footswitches are decoded by name', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const pedal = page.getByRole('region', { name: 'Virtual Pedal' });
  const last = pedal.getByRole('log').getByRole('listitem').last();

  await editor.getByRole('group', { name: 'Amp Type' }).getByRole('radio', { name: 'Solo' }).check();
  await expect(last).toHaveText('CC 21 = 3 → Amp Type → Solo');
  await expect(pedal.getByLabel('Amp Type')).toHaveText('Solo');
  await editor.getByRole('group', { name: 'Amp Type' }).getByRole('radio', { name: 'Plexi' }).check();
  await expect(last).toHaveText('CC 21 = 2 → Amp Type → Plexi');
  await editor.getByRole('group', { name: 'Effect Order' }).getByRole('radio', { name: '2>1' }).check();
  await expect(last).toHaveText('CC 22 = 1 → Effect Order → 2>1');
  await editor.getByRole('group', { name: 'OD Type' }).getByRole('radio', { name: 'RJM' }).check();
  await expect(last).toHaveText('CC 23 = 3 → OD Type → RJM');

  await editor.getByRole('button', { name: 'Channel 2 Bypass' }).click();
  await expect(editor.getByRole('button', { name: 'Channel 2 Bypass' })).toContainText('Channel 2 Bypass · Bypassed');
  await expect(last).toHaveText('CC 103 = 0 → Channel 2 Bypass → Bypassed');
  await expect(pedal.getByLabel('Channel 2 Bypass LED')).toHaveText('Off');
  await editor.getByRole('button', { name: 'Channel 1 Bypass' }).click();
  await expect(last).toHaveText('CC 102 = 127 → Channel 1 Bypass → Engaged');
  await expect(pedal.getByLabel('Channel 1 Bypass LED')).toHaveText('On');
});

test('double-click resets a knob to its default', async ({ page }) => {
  await page.goto('/');
  const vol1 = page.getByRole('region', { name: 'Pedal' }).getByRole('slider', { name: 'Vol 1', exact: true });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  for (let i = 0; i < 5; i++) await vol1.press('ArrowDown');
  await expect(vol1).toHaveAttribute('aria-valuenow', '59');
  await vol1.dblclick();
  await expect(vol1).toHaveAttribute('aria-valuenow', '64');
  await expect(last).toHaveText('CC 18 = 64 → Vol 1');
});

test('Expression sends live', async ({ page }) => {
  await page.goto('/');
  const performance = page.getByRole('region', { name: 'Performance' });
  const last = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log').getByRole('listitem').last();

  await performance.getByRole('slider', { name: 'Expression' }).fill('90');
  await expect(last).toHaveText('CC 100 = 90 → Expression');
  await expect(performance.getByText('90', { exact: true })).toBeVisible();
});
