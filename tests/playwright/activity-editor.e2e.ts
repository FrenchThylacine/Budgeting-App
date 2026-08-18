import { test, expect } from '@playwright/test';

// Reproduces typing/focus behaviour for the Activity editor. It opens the app,
// finds the first activity row, taps it to open the editor, focuses the name
// input, types a long string and asserts focus and final value.

test('activity editor typing keeps focus and preserves input', async ({ page }) => {
  await page.goto('/');

  // Wait for Activities heading
  await page.waitForSelector('text=Activities');

  // Tap the first activity card (assumes at least one seeded activity exists)
  const firstActivity = page.locator('[data-test=activity-row]').first();
  await expect(firstActivity).toBeVisible();
  await firstActivity.click();

  // Find name input inside the editor
  const nameInput = page.locator('input[placeholder="Activity name *"]');
  await expect(nameInput).toBeVisible();

  const longText = 'Tennis lessons and court hire with advanced booking and equipment storage';
  await nameInput.focus();
  await nameInput.type(longText, { delay: 40 });

  await expect(nameInput).toBeFocused();
  await expect(nameInput).toHaveValue(longText);
});
