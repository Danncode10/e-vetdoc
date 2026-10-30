import { test, expect, type Page, type Request } from '@playwright/test';
import { deleteAccounts, serviceDb, uniqueEmail } from './flows/accounts';
import { forgeChallenge, solveSpamCheck } from './flows/captcha';

// Expiry and spam-burst checks for the built-in captcha. Each test replays the real
// sign-up server action (as a bot would) with a challenge we control.
test.describe.configure({ mode: 'serial', timeout: 120000 });

const CAPTCHA_FAILED = 'The spam check answer is wrong or expired. Please try the new question.';
const createdEmails: string[] = [];
let template: { url: string; headers: Record<string, string>; args: unknown[] };

test.afterAll(async () => {
  test.setTimeout(120000);
  const { data } = await serviceDb().from('profiles').select('id').in('email', createdEmails);
  await deleteAccounts((data ?? []).map((row) => row.id));
});

async function profileExists(email: string) {
  const { data } = await serviceDb().from('profiles').select('id').eq('email', email);
  return (data ?? []).length > 0;
}

/** Sends the captured sign-up action with a new email and captcha. Returns the response text. */
async function signUpAs(page: Page, email: string, captcha: { token: string; answer: string; website?: string }) {
  const args = [...template.args];
  args[0] = email;
  args[5] = { website: '', ...captcha };
  const response = await page.request.post(template.url, { headers: template.headers, data: JSON.stringify(args) });
  return response.text();
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(120000);
  // Capture one real sign-up request (with a wrong answer, so nothing is created).
  const page = await browser.newPage();
  await page.goto('/login');
  await page.locator('#email').waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Create Account', exact: true }).first().click();
  const email = uniqueEmail('captcha-template');
  await page.locator('#name').fill('E2E Captcha Abuse');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('E2e-Captcha-Pass1!');
  const right = await page.getByTestId('spam-check').getAttribute('data-test-answer', { timeout: 30000 });
  await solveSpamCheck(page, String((Number(right) + 1) % 19));

  const captured = new Promise<Request>((resolve) => {
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.headers()['next-action'] && request.postData()?.includes(email)) resolve(request);
    });
  });
  await page.locator('button[type="submit"]').click();
  const request = await captured;
  await expect(page.getByText(CAPTCHA_FAILED)).toBeVisible({ timeout: 30000 });

  template = {
    url: request.url(),
    headers: Object.fromEntries(Object.entries(request.headers()).filter(([name]) => name !== 'content-length')),
    args: JSON.parse(request.postData()!),
  };
  await page.close();
});

test('control: a valid challenge with the right answer creates the account', async ({ page }) => {
  const email = uniqueEmail('captcha-control');
  createdEmails.push(email);
  const token = forgeChallenge({ answer: '7', expiresAt: Date.now() + 5 * 60_000 });
  const text = await signUpAs(page, email, { token, answer: '7' });
  expect(text).not.toContain(CAPTCHA_FAILED);
  await expect.poll(() => profileExists(email), { timeout: 30000 }).toBe(true);
});

test('an expired challenge is rejected even with the right answer', async ({ page }) => {
  const email = uniqueEmail('captcha-expired');
  createdEmails.push(email);
  const token = forgeChallenge({ answer: '7', expiresAt: Date.now() - 1000 });
  expect(await signUpAs(page, email, { token, answer: '7' })).toContain(CAPTCHA_FAILED);
  expect(await profileExists(email)).toBe(false);
});

test('a tampered token is rejected', async ({ page }) => {
  const email = uniqueEmail('captcha-tampered');
  createdEmails.push(email);
  const token = forgeChallenge({ answer: '7', expiresAt: Date.now() + 60_000 });
  // Same signature, but claim a longer expiry: the signature no longer matches.
  const [, signature] = token.split('.');
  const extended = Buffer.from(JSON.stringify({ n: 'tampered', e: Date.now() + 86_400_000 })).toString('base64url');
  expect(await signUpAs(page, email, { token: `${extended}.${signature}`, answer: '7' })).toContain(CAPTCHA_FAILED);
  expect(await profileExists(email)).toBe(false);
});

test('spam burst: 5 simultaneous sign-ups with one solved challenge create at most one account', async ({ page }) => {
  const token = forgeChallenge({ answer: '9', expiresAt: Date.now() + 5 * 60_000 });
  const emails = Array.from({ length: 5 }, (_, i) => uniqueEmail(`captcha-burst-${i}`));
  createdEmails.push(...emails);

  const responses = await Promise.all(emails.map((email) => signUpAs(page, email, { token, answer: '9' })));
  expect(responses.filter((text) => text.includes(CAPTCHA_FAILED))).toHaveLength(4);

  await expect
    .poll(async () => (await Promise.all(emails.map(profileExists))).filter(Boolean).length, { timeout: 30000 })
    .toBe(1);
});

test('spam bots that fill the honeypot are rejected even with a valid challenge', async ({ page }) => {
  const email = uniqueEmail('captcha-honeypot');
  createdEmails.push(email);
  const token = forgeChallenge({ answer: '4', expiresAt: Date.now() + 60_000 });
  expect(await signUpAs(page, email, { token, answer: '4', website: 'http://spam.example' })).toContain(CAPTCHA_FAILED);
  expect(await profileExists(email)).toBe(false);
});
