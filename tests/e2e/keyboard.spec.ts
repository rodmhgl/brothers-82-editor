import { expect, test, type Page } from '@playwright/test';

// Playwright's Chromium reports Linux, so the shortcuts use Ctrl rather than ⌘.

const UNNAMED_CONTROL =
  /^\s*- (button|slider|checkbox|radio|combobox|switch|tab|textbox|spinbutton|link|listbox)( \[[^\]]*\])*:?$/;

/** Loads the editor and waits for it to connect, by when its shortcuts are listening. */
async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('banner', { name: 'Connection' }).getByLabel('Connection status')).toHaveText('Connected');
}

/** The drawer slides away rather than hiding, so its button says whether it is open. */
const dataButton = (page: Page) => page.getByRole('button', { name: /^Data/ });

/** Controls in the accessibility tree with no accessible name, as their aria snapshot lines. */
async function unnamedControls(page: Page) {
  const snapshot = await page.locator('body').ariaSnapshot();
  return snapshot.split('\n').filter((line) => UNNAMED_CONTROL.test(line));
}

test('the editor works from the keyboard alone', async ({ page }) => {
  await open(page);
  const connection = page.getByRole('banner', { name: 'Connection' });
  const editor = page.getByRole('region', { name: 'Editor' });
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const drawer = page.getByRole('complementary', { name: 'Data' });
  const lastSent = log.getByRole('listitem').last();

  // Ctrl+H reaches the Hidden Options, at Gate Release; knobs move with the arrow keys.
  await page.keyboard.press('Control+H');
  const hidden = editor.getByRole('region', { name: 'Hidden Options' });
  const gateRelease = hidden.getByRole('slider', { name: 'Gate Release' });
  await expect(gateRelease).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(gateRelease).toHaveAttribute('aria-valuenow', '66');
  await expect(lastSent).toHaveText('CC 24 = 66 → Gate Release');

  await page.keyboard.press('Control+Z');
  await expect(gateRelease).toHaveAttribute('aria-valuenow', '65');
  await page.keyboard.press('Control+Shift+Z');
  await expect(gateRelease).toHaveAttribute('aria-valuenow', '66');

  await page.keyboard.press('Control+E');
  await expect(connection.getByLabel('Sync Status')).toHaveText('In Sync');

  // ? opens Help; Escape closes the drawer and hands focus back to the Data button.
  await page.keyboard.press('?');
  const helpTab = drawer.getByRole('tab', { name: 'Help' });
  await expect(helpTab).toHaveAttribute('aria-selected', 'true');
  await expect(helpTab).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(drawer.getByRole('tab', { name: 'Library' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dataButton(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(dataButton(page)).toBeFocused();

  // Ctrl+S with no Library yet shows the Library, to choose one.
  await page.keyboard.press('Control+S');
  await expect(drawer.getByRole('button', { name: 'Choose folder…' })).toBeVisible();
});

test('Ctrl+S saves to the Working State’s Preset, asking for a name the first time', async ({ page }) => {
  await page.addInitScript(() => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle('Keyboard Presets', { create: true });
  });
  await open(page);
  const workingState = page.getByRole('banner', { name: 'Connection' }).getByLabel('Working State');
  const drawer = page.getByRole('complementary', { name: 'Data' });

  await page.keyboard.press('Control+S');
  await drawer.getByRole('button', { name: 'Choose folder…' }).click();
  await drawer.getByRole('button', { name: 'Close Data drawer' }).click();

  const dry = page.getByRole('region', { name: 'Editor' }).getByRole('slider', { name: 'Dry' });
  await dry.press('ArrowUp');
  await page.keyboard.press('Control+S');
  const name = drawer.getByRole('form', { name: 'Save As' }).getByLabel('Preset name');
  await expect(name).toBeFocused();
  await page.keyboard.type('Keyed Up');
  await page.keyboard.press('Enter');
  await expect(workingState).toHaveText('Keyed Up');

  // Once it has a Preset, Ctrl+S saves quietly.
  await drawer.getByRole('button', { name: 'Close Data drawer' }).click();
  await dry.press('ArrowUp');
  await expect(workingState).toHaveText('Keyed Up •');
  await page.keyboard.press('Control+S');
  await expect(workingState).toHaveText('Keyed Up');
  await expect(dataButton(page)).toHaveAttribute('aria-expanded', 'false');
});

test('shortcuts leave text fields and dropdowns alone', async ({ page }) => {
  await open(page);
  const log = page.getByRole('region', { name: 'Virtual Pedal' }).getByRole('log');
  const input = page.getByRole('combobox', { name: 'MIDI input' });

  await input.focus();
  await page.keyboard.press('?');
  await expect(log.getByRole('listitem')).toHaveCount(0);
  await expect(dataButton(page)).toHaveAttribute('aria-expanded', 'false');
});

test('every control has an accessible name and is reachable with Tab', async ({ page }) => {
  await page.goto('/');
  const drawer = page.getByRole('complementary', { name: 'Data' });

  expect(await unnamedControls(page)).toEqual([]);
  await page.getByRole('button', { name: /^Data/ }).click();
  for (const tab of ['Parameters', 'MIDI Monitor', 'Slots', 'Library', 'Help']) {
    await drawer.getByRole('tab', { name: tab }).click();
    expect(await unnamedControls(page), tab).toEqual([]);
  }
  await drawer.getByRole('button', { name: 'Close Data drawer' }).click();

  // Tab through the console and note what takes focus; a radio group is one stop, so only its checked radio counts.
  const controls = await page.evaluate(() => {
    const all = document.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const reachable = [...all].filter(
      (el) =>
        !el.closest('[inert]') &&
        !(el as HTMLButtonElement).disabled &&
        el.getClientRects().length > 0 &&
        !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked),
    );
    reachable.forEach((el, i) => (el.dataset.tabStop = String(i)));
    return reachable.length;
  });
  const reached = new Set<string>();
  for (let i = 0; i < controls + 10; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.tabStop);
    if (stop) reached.add(stop);
  }
  const missed = await page.evaluate(
    (reached) =>
      [...document.querySelectorAll<HTMLElement>('[data-tab-stop]')]
        .filter((el) => !reached.includes(el.dataset.tabStop!))
        .map((el) => el.getAttribute('aria-label') ?? el.textContent),
    [...reached],
  );
  expect(missed).toEqual([]);
});

test('the layout scales with the window and fits the minimum size', async ({ page }) => {
  const knobWidth = async () => (await page.getByRole('region', { name: 'Editor' }).getByRole('slider', { name: 'Dynamics' }).boundingBox())!.width;
  const fitsWidth = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/');
  // The layout scale is applied after the first render.
  await expect.poll(fitsWidth).toBe(true);
  const small = await knobWidth();

  await page.setViewportSize({ width: 1800, height: 1200 });
  await expect.poll(knobWidth).toBeCloseTo(small * 2, 0);
  expect(await fitsWidth()).toBe(true);
});
