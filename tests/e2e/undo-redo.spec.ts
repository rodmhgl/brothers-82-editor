import { expect, test } from '@playwright/test';

test('undo returns the Virtual Pedal to the value before a knob drag, and redo restores it', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const knob = editor.getByRole('slider', { name: 'Sensitivity' });
  const pedalSensitivity = page.getByRole('region', { name: 'Virtual Pedal' }).getByLabel('Sensitivity');

  await expect(pedalSensitivity).toHaveText('77');
  const box = (await knob.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 60, { steps: 6 });
  await page.mouse.up();
  const dragged = (await knob.getAttribute('aria-valuenow'))!;
  expect(Number(dragged)).toBeGreaterThan(77);
  await expect(pedalSensitivity).toHaveText(dragged);

  // The whole drag is one step.
  await page.keyboard.press('ControlOrMeta+z');
  await expect(knob).toHaveAttribute('aria-valuenow', '77');
  await expect(pedalSensitivity).toHaveText('77');

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(knob).toHaveAttribute('aria-valuenow', dragged);
  await expect(pedalSensitivity).toHaveText(dragged);
});

test('undo steps back one Working State edit at a time and leaves Performance Controls alone', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const pedalEq = page.getByRole('region', { name: 'Virtual Pedal' }).getByLabel('EQ', { exact: true });
  const eq = editor.getByRole('slider', { name: 'EQ', exact: true });
  const ramping = page.getByRole('region', { name: 'Performance' }).getByRole('button', { name: /Ramping/ });

  await eq.press('ArrowUp');
  await eq.press('ArrowUp');
  await ramping.click();
  await expect(ramping).toHaveAttribute('aria-pressed', 'true');
  await expect(pedalEq).toHaveText('66');

  await page.keyboard.press('ControlOrMeta+z');
  await expect(pedalEq).toHaveText('65');
  await expect(ramping).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(pedalEq).toHaveText('64');
  await expect(eq).toHaveAttribute('aria-valuenow', '64');
  await expect(ramping).toHaveAttribute('aria-pressed', 'true');
});
