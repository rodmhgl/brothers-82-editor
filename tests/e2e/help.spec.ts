import { expect, test } from '@playwright/test';

test('hovering a control shows its name, CC, value and meaning', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const tip = page.getByRole('tooltip');
  const eq = editor.getByRole('slider', { name: 'EQ', exact: true });

  await editor.getByRole('slider', { name: 'Dynamics' }).hover();
  await expect(tip).toContainText('Dynamics');
  await expect(tip).toContainText('CC 14');
  await expect(tip).toContainText('39 · 31%');

  await eq.focus();
  for (let i = 0; i < 6; i++) await eq.press('ArrowUp');
  await expect(tip).toContainText('EQ');
  await expect(tip).toContainText('70 · Noon +6');
  await expect(eq).toHaveAttribute('aria-describedby', 'control-help');

  await editor.getByRole('group', { name: 'Mode' }).hover();
  await expect(tip).toContainText('2 · Manual');

  await page.keyboard.press('Escape');
  await expect(tip).toHaveCount(0);
});

test('Help lists the keyboard shortcuts, B and W among them', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help ?' }).click();
  const shortcuts = page.getByRole('complementary', { name: 'Data' }).getByLabel('Keyboard shortcuts');

  // Playwright's Chromium reports Linux, so the command shortcuts use Ctrl.
  await expect(shortcuts.getByRole('term')).toHaveText(['Ctrl+S', 'Ctrl+Z', 'Ctrl+Shift+Z', 'B', 'W', 'Ctrl+E', 'Ctrl+H', '?']);
  await expect(shortcuts.getByRole('definition')).toHaveText([
    'Save',
    'Undo',
    'Redo',
    'Toggle Bypass',
    'Toggle Swell',
    'Send All',
    'Hidden Options panel',
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

test('the hover card follows the context: EQ names its mode', async ({ page }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Editor' });
  const tip = page.getByRole('tooltip');

  await editor.getByRole('slider', { name: 'EQ', exact: true }).focus();
  await expect(tip).toContainText('64 · Noon · Flat · Manual');
});

test('the Help tab offers both guides', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Help ?' }).click();
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const guides = drawer.getByRole('navigation', { name: 'Guides' });

  await expect(drawer.getByRole('region', { name: 'Getting connected' })).toBeVisible();
  await guides.getByRole('button', { name: 'How the controls interact' }).click();
  const guide = drawer.getByRole('region', { name: 'How the controls interact' });
  await expect(guide.getByRole('heading', { name: 'Dynamics: how hard to clamp' })).toBeVisible();
  await expect(guide).toContainText('compression → limiting → sag');
  await guides.getByRole('button', { name: 'Getting connected' }).click();
  await expect(drawer.getByRole('region', { name: 'Getting connected' })).toBeVisible();
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
