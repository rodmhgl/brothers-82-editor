import { expect, test } from '@playwright/test';

test('hovering a control shows its name, CC, value and meaning', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const tip = page.getByRole('tooltip');
  const vol1 = editor.getByRole('slider', { name: 'Vol 1', exact: true });

  await editor.getByRole('slider', { name: 'Gain 2' }).hover();
  await expect(tip).toContainText('Gain 2');
  await expect(tip).toContainText('CC 14');
  await expect(tip).toContainText('64 · 50%');

  await vol1.focus();
  await vol1.press('End');
  await expect(tip).toContainText('Vol 1');
  await expect(tip).toContainText('127 · 100%');
  await expect(vol1).toHaveAttribute('aria-describedby', 'control-help');

  await editor.getByRole('group', { name: 'Amp Type' }).hover();
  await expect(tip).toContainText('2 · Plexi');

  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);
});

test('Help lists the keyboard shortcuts, 1 and 2 among them', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help ?' }).click();
  const shortcuts = page.getByRole('complementary', { name: 'Data' }).getByLabel('Keyboard shortcuts');

  // Playwright's Chromium reports Linux, so the command shortcuts use Ctrl.
  await expect(shortcuts.getByRole('term')).toHaveText(['Ctrl+S', 'Ctrl+Z', 'Ctrl+Shift+Z', '1', '2', 'Ctrl+E', '?']);
  await expect(shortcuts.getByRole('definition')).toHaveText([
    'Save',
    'Undo',
    'Redo',
    'Toggle Channel 1 Bypass',
    'Toggle Channel 2 Bypass',
    'Send All',
    'Help',
  ]);
});

test('Help opens from the top bar and with ?', async ({ page }) => {
  await page.goto('/');
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const helpButton = page.getByRole('button', { name: 'Help ?' });

  await page.locator('body').press('?');
  await expect(helpButton).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.getByRole('tab', { name: 'Help' })).toHaveAttribute('aria-selected', 'true');

  await page.locator('body').press('?');
  await expect(helpButton).toHaveAttribute('aria-expanded', 'false');
  await helpButton.click();
  await expect(helpButton).toHaveAttribute('aria-expanded', 'true');
});

test('the Getting connected guide runs the MIDI channel wizard and switches to the Virtual Pedal', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help ?' }).click();
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const guide = drawer.getByRole('region', { name: 'Getting connected' });

  await expect(guide.getByRole('heading', { name: 'Troubleshooting with the Virtual Pedal' })).toBeVisible();
  await expect(guide).toContainText('TRS');
  await expect(guide.getByRole('button', { name: 'Virtual Pedal selected' })).toBeDisabled();

  await guide.getByRole('button', { name: 'Set pedal’s MIDI channel…' }).click();
  const wizard = page.getByRole('dialog', { name: 'Set the pedal’s MIDI channel' });
  await expect(wizard).toBeVisible();
  await wizard.getByRole('button', { name: 'Cancel' }).click();
  await expect(wizard).toHaveCount(0);
});
