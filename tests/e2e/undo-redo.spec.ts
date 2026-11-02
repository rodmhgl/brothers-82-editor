import { expect, test } from '@playwright/test';

test('undo returns the Virtual Pedal to the value before a knob drag, and redo restores it', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const knob = editor.getByRole('slider', { name: 'Vol 2' });
  const pedalVol2 = page.getByRole('region', { name: 'Virtual Pedal' }).getByLabel('Vol 2');

  await expect(pedalVol2).toHaveText('64');
  const box = (await knob.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 6 });
  await page.mouse.up();
  const dragged = (await knob.getAttribute('aria-valuenow'))!;
  expect(Number(dragged)).toBeGreaterThan(64);
  await expect(pedalVol2).toHaveText(dragged);

  // The whole drag is one step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(knob).toHaveAttribute('aria-valuenow', '64');
  await expect(pedalVol2).toHaveText('64');

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(knob).toHaveAttribute('aria-valuenow', dragged);
  await expect(pedalVol2).toHaveText(dragged);
});

test('undo steps back one Working State edit at a time and leaves Expression alone', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const pedalVol1 = page.getByRole('region', { name: 'Virtual Pedal' }).getByLabel('Vol 1', { exact: true });
  const vol1 = editor.getByRole('slider', { name: 'Vol 1', exact: true });
  const expression = page.getByRole('region', { name: 'Performance' }).getByRole('slider', { name: 'Expression' });

  await vol1.press('ArrowUp');
  await vol1.press('ArrowUp');
  await expression.fill('40');
  await expect(pedalVol1).toHaveText('66');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(pedalVol1).toHaveText('65');
  await expect(expression).toHaveValue('40');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pedalVol1).toHaveText('64');
  await expect(vol1).toHaveAttribute('aria-valuenow', '64');
  await expect(expression).toHaveValue('40');
});

test('toggles and Channel Bypass undo like knobs', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const plexi = editor.getByRole('group', { name: 'Amp Type' }).getByRole('radio', { name: 'Plexi' });
  const channel1 = editor.getByRole('button', { name: 'Channel 1 Bypass' });

  await editor.getByRole('group', { name: 'Amp Type' }).getByRole('radio', { name: 'Solo' }).check();
  await channel1.click();
  await expect(channel1).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(channel1).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(plexi).toBeChecked();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(plexi).not.toBeChecked();
});
