import { test, expect } from '@playwright/test';

// This E2E reproduces the Editor typing/focus regression reported for the
// Wishlist editor. It opens the app, opens the "Add item" sheet, focuses the
// name input, types a long multi-word string and asserts the input retains
// focus and the final value is preserved.

test('wishlist editor typing keeps focus and preserves input', async ({ page }) => {
  // navigate to baseURL
  await page.goto('/');

  // wait for Wishlist section to be visible
  await page.waitForSelector('text=Wishlist');

  // Click the "Add item" button
  const addBtn = page.getByRole('button', { name: /Add item/i });
  await addBtn.click();

  // Ensure the sheet opened by locating the form input by its placeholder
  const nameInput = page.locator('input[placeholder="Item name *"]');
  await expect(nameInput).toBeVisible();

  // Focus the input explicitly then type a long string
  await nameInput.focus();
  const longText = 'Microsoft Flight Simulator hardware and accessories - advanced yoke, throttle, pedals';
  await nameInput.type(longText, { delay: 50 });

  // Assert focus remains inside the name input
  await expect(nameInput).toBeFocused();

  // Assert the final value is the same as typed
  await expect(nameInput).toHaveValue(longText);
});
