import { test, expect, type Page } from '@playwright/test';
import { deleteAccounts, serviceDb, uniqueEmail } from './flows/accounts';

// Stage 3 — registration with a requested role + captcha (#2).
// Uses Cloudflare's always-pass Turnstile test keys from .env.local.
test.describe.configure({ timeout: 120000 });

const createdEmails: string[] = [];

test.afterAll(async () => {
  const db = serviceDb();
  const { data } = await db.from('profiles').select('id').in('email', createdEmails);
  await deleteAccounts((data ?? []).map((row) => row.id));
});

async function openSignUp(page: Page) {
  await page.goto('/login');
  await page.locator('#email').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Create Account', exact: true }).first().click();
  await expect(page.getByText('Register as')).toBeVisible();
}

async function fillSignUp(page: Page, email: string, role: string) {
  await page.locator('#name').fill('E2E Registrant');
  await page.locator(`label[for="register-as-${role}"]`).click();
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('E2e-Register-Pass1!');
}

test('sign-up offers Admin, Staff, Veterinarian and Owner', async ({ page }) => {
  await openSignUp(page);
  for (const role of ['admin', 'staff', 'veterinarian', 'owner']) {
    await expect(page.locator(`#register-as-${role}`)).toHaveCount(1);
  }
  await expect(page.locator('#register-as-owner')).toBeChecked();
  await expect(page.getByText('New accounts stay pending until an Admin or Staff member approves them.')).toBeVisible();
});

test('sign-up is blocked when the captcha is not completed', async ({ page }) => {
  await page.route('**/challenges.cloudflare.com/**', (route) => route.abort());
  await openSignUp(page);
  const email = uniqueEmail('nocaptcha');
  await fillSignUp(page, email, 'owner');
  await page.locator('button[type="submit"]').click();
  await expect(page.getByText('Please complete the "I\'m not a robot" check')).toBeVisible({ timeout: 30000 });

  const { data } = await serviceDb().from('profiles').select('id').eq('email', email);
  expect(data ?? []).toHaveLength(0);
});

test('a completed sign-up creates a pending account with the requested role', async ({ page }) => {
  await openSignUp(page);
  // Turnstile renders its iframe in a closed shadow root; the response input is what we can see.
  await expect(page.getByTestId('signup-captcha').locator('input[name="cf-turnstile-response"]')).toBeAttached({ timeout: 30000 });

  const email = uniqueEmail('register');
  createdEmails.push(email);
  await fillSignUp(page, email, 'veterinarian');
  await expect(page.locator('input[name="cf-turnstile-response"]')).not.toHaveValue('', { timeout: 30000 });
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText('must approve it before you can sign in')).toBeVisible({ timeout: 30000 });

  const { data: profile } = await serviceDb()
    .from('profiles')
    .select('role, requested_role, approval_status')
    .eq('email', email)
    .single();
  expect(profile).toEqual({ role: 'owner', requested_role: 'veterinarian', approval_status: 'pending' });
});
