import { expect, type Page } from '@playwright/test';

/**
 * Answers the built-in spam check. The dev server exposes the answer on
 * `data-test-answer`; production builds never send it.
 */
export async function solveSpamCheck(page: Page, answer?: string) {
  const check = page.getByTestId('spam-check');
  await expect(check).toBeVisible({ timeout: 30000 });
  const value = answer ?? (await check.getAttribute('data-test-answer'));
  if (value === null) throw new Error('The spam check did not expose a test answer (is this a production build?).');
  await page.locator('#captcha-answer').fill(value);
  return value;
}

/** The current challenge's image (changes with every new question). */
export function spamCheckImage(page: Page) {
  return page.getByTestId('spam-check-image');
}
