import { test, expect, type Page, type Request } from '@playwright/test';
import { deleteAccounts, serviceDb, uniqueEmail } from './flows/accounts';
import { solveSpamCheck, spamCheckImage } from './flows/captcha';

// Built-in spam check (no Turnstile keys configured, exactly like production today):
// a math question drawn as an image, a honeypot field, and single-use challenges.
test.describe.configure({ mode: 'serial', timeout: 120000 });

const CAPTCHA_FAILED = 'The spam check answer is wrong or expired. Please try the new question.';
const createdEmails: string[] = [];

test.afterAll(async () => {
  test.setTimeout(120000);
  const { data } = await serviceDb().from('profiles').select('id').in('email', createdEmails);
  await deleteAccounts((data ?? []).map((row) => row.id));
});

async function openSignUp(page: Page) {
  await page.goto('/login');
  await page.locator('#email').waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Create Account', exact: true }).first().click();
  await expect(page.getByTestId('spam-check')).toBeVisible({ timeout: 30000 });
}

async function fillSignUp(page: Page, email: string) {
  await page.locator('#name').fill('E2E Captcha');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('E2e-Captcha-Pass1!');
}

async function profileExists(email: string) {
  const { data } = await serviceDb().from('profiles').select('id').eq('email', email);
  return (data ?? []).length > 0;
}

test('the question is an image, not readable page text, and Turnstile is not used', async ({ page }) => {
  await openSignUp(page);
  const src = await spamCheckImage(page).getAttribute('src');
  expect(src).toMatch(/^data:image\/svg\+xml;base64,/);

  // Drawn with strokes, not <text>: a bot cannot read the numbers out of the markup.
  const svg = Buffer.from(src!.split(',')[1], 'base64').toString('utf8');
  expect(svg).not.toContain('<text');
  const answer = await page.getByTestId('spam-check').getAttribute('data-test-answer');
  expect(svg).not.toContain(`>${answer}<`);

  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveCount(0);
  await expect(page.locator('#captcha-answer')).toBeVisible();
});

test('"Show a different question" loads a new challenge', async ({ page }) => {
  await openSignUp(page);
  const before = await spamCheckImage(page).getAttribute('src');
  await page.getByRole('button', { name: 'Show a different question' }).click();
  await expect(spamCheckImage(page)).not.toHaveAttribute('src', before!, { timeout: 30000 });
});

test('an empty answer is caught before submitting', async ({ page }) => {
  await openSignUp(page);
  const email = uniqueEmail('captcha-empty');
  await fillSignUp(page, email);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('Answer the spam check question.')).toBeVisible();
  expect(await profileExists(email)).toBe(false);
});

test('a wrong answer is rejected, no account is created, and a new question appears', async ({ page }) => {
  await openSignUp(page);
  const email = uniqueEmail('captcha-wrong');
  await fillSignUp(page, email);
  const right = await page.getByTestId('spam-check').getAttribute('data-test-answer');
  const before = await spamCheckImage(page).getAttribute('src');
  await solveSpamCheck(page, String((Number(right) + 1) % 19));
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText(CAPTCHA_FAILED)).toBeVisible({ timeout: 30000 });
  await expect(spamCheckImage(page)).not.toHaveAttribute('src', before!, { timeout: 30000 });
  expect(await profileExists(email)).toBe(false);
});

test('bots that fill the hidden honeypot field are rejected', async ({ page }) => {
  await openSignUp(page);
  const email = uniqueEmail('captcha-bot');
  await fillSignUp(page, email);
  await solveSpamCheck(page);
  // People never see this field; simple bots fill every input.
  await page.locator('#captcha-website').fill('https://spam.example', { force: true });
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText(CAPTCHA_FAILED)).toBeVisible({ timeout: 30000 });
  expect(await profileExists(email)).toBe(false);
});

test('a correct answer creates the account, and the same solved challenge cannot be reused', async ({ page }) => {
  await openSignUp(page);
  const email = uniqueEmail('captcha-ok');
  createdEmails.push(email);
  await fillSignUp(page, email);
  await solveSpamCheck(page);

  // Capture the sign-up request so we can replay it like a bot would.
  let signUpRequest: Request | undefined;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.headers()['next-action'] && request.postData()?.includes(email)) {
      signUpRequest = request;
    }
  });
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('must approve it before you can sign in')).toBeVisible({ timeout: 30000 });
  await expect.poll(() => profileExists(email), { timeout: 30000 }).toBe(true);

  expect(signUpRequest).toBeDefined();
  const replayEmail = uniqueEmail('captcha-replay');
  createdEmails.push(replayEmail);
  // The body length changes with the new email, so let the client recompute it.
  const headers = Object.fromEntries(Object.entries(signUpRequest!.headers()).filter(([name]) => name !== 'content-length'));
  const response = await page.request.post(signUpRequest!.url(), {
    headers,
    data: signUpRequest!.postData()!.replace(email, replayEmail),
  });
  expect(await response.text()).toContain(CAPTCHA_FAILED);
  expect(await profileExists(replayEmail)).toBe(false);
});

test('forgot password also needs the spam check', async ({ page }) => {
  await page.goto('/login?mode=recovery');
  await page.locator('#email').waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle');
  await expect(page.getByTestId('spam-check')).toBeVisible({ timeout: 30000 });

  // An address with no account: Supabase answers "sent" without emailing anyone.
  await page.locator('#email').fill(uniqueEmail('captcha-reset'));
  const right = await page.getByTestId('spam-check').getAttribute('data-test-answer');
  await solveSpamCheck(page, String((Number(right) + 1) % 19));
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText(CAPTCHA_FAILED)).toBeVisible({ timeout: 30000 });

  await solveSpamCheck(page);
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('Reset email sent').first()).toBeVisible({ timeout: 30000 });
});
