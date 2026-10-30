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

/**
 * Builds a challenge token exactly like src/services/captcha.ts does, with the same
 * server key (derived from SUPABASE_SERVICE_ROLE_KEY unless CAPTCHA_SECRET is set).
 * Lets tests create expired challenges or fire bursts like a spam bot.
 */
export function forgeChallenge(options: { answer: string; expiresAt: number; nonce?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac, randomBytes } = require('node:crypto') as typeof import('node:crypto');
  const base = process.env.CAPTCHA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const key = createHmac('sha256', base).update('e-vetdoc-captcha-v1').digest();
  const payload = Buffer.from(
    JSON.stringify({ n: options.nonce ?? randomBytes(12).toString('base64url'), e: options.expiresAt }),
  ).toString('base64url');
  const signature = createHmac('sha256', key).update(`${payload}|${options.answer}`).digest('base64url');
  return `${payload}.${signature}`;
}
