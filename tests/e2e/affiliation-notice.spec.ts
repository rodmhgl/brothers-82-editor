import { expect, test } from '@playwright/test';

test('the app shows a notice that it is not affiliated with the pedal maker', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText(/editor for the Clean pedal/i)).toBeVisible();
  await expect(page.getByText(/not affiliated with or endorsed by the pedal's maker/i)).toBeVisible();
  // SPEC §0 Branding: the maker's name never appears in the UI.
  await expect(page.locator('body')).not.toContainText(/chase\s*bliss/i);
});
