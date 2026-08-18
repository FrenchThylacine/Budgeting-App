import { test, expect } from '@playwright/test';

// Reproduces typing/focus behaviour for the Spending editor. It opens the app,
// opens the New transaction sheet, focuses the Note input, types a long string
// and asserts focus and final value.

test('spending editor typing keeps focus and preserves input', async ({ page }) => {
  await page.goto('/');

  // Wait for Spending section
  await page.waitForSelector('text=Spending');

  // Click "Add transaction" button
  const addBtn = page.getByRole('button', { name: /Add transaction/i });
  await addBtn.click();

  // Ensure the Paid from select is visible then change it to 'Outside budget'
  const paidFrom = page.getByLabel('Paid from');
  await expect(paidFrom).toBeVisible();
  await paidFrom.selectOption('external');

  // Ensure the note input is present and type a long note
  const noteInput = page.getByPlaceholder('Optional');
  await expect(noteInput).toBeVisible();
  await noteInput.focus();
  const longNote = 'Paid by company card for conference travel and accommodation; includes meals, transport and incidentals.';
  await noteInput.type(longNote, { delay: 30 });

  await expect(noteInput).toBeFocused();
  await expect(noteInput).toHaveValue(longNote);
});
