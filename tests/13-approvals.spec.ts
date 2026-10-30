import { test, expect, type Page } from '@playwright/test';
import {
  accounts,
  createAccount,
  deleteAccounts,
  getProfile,
  loginAndOpenDashboard,
  loginThroughUi,
  serviceDb,
  sidebarTab,
} from './flows/accounts';

// Stage 4 — login gate, account-status page, and Approve / Disapprove (#3).
test.describe.configure({ timeout: 120000 });

const created: string[] = [];
test.afterAll(async () => deleteAccounts(created));

async function openApprovals(page: Page, who: keyof typeof accounts) {
  await loginAndOpenDashboard(page, accounts[who].email, accounts[who].password);
  await sidebarTab(page, 'Approvals').click();
  await expect(page.getByRole('heading', { name: 'Registration approvals' })).toBeVisible({ timeout: 30000 });
}

test('a pending account cannot sign in', async ({ page }) => {
  const pending = await createAccount({ requestedRole: 'veterinarian' });
  created.push(pending.id);
  await loginThroughUi(page, pending.email, pending.password);
  await expect(page.getByText('Your account is waiting for approval by the clinic.')).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/login/);
});

test('admin approves a registration and the user can then sign in', async ({ page, browser }) => {
  const pending = await createAccount({ requestedRole: 'veterinarian', fullName: 'E2E Pending Vet' });
  created.push(pending.id);

  await openApprovals(page, 'admin');
  const row = page.getByTestId(`registration-${pending.email}`);
  await expect(row).toBeVisible({ timeout: 30000 });
  await expect(row.locator('select')).toHaveValue('veterinarian');
  await row.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText(`${pending.email} approved as Veterinarian.`)).toBeVisible({ timeout: 30000 });
  await expect(row).toHaveCount(0);

  const profile = await getProfile(pending.id);
  expect(profile.approval_status).toBe('approved');
  expect(profile.role).toBe('veterinarian');

  const { data: log } = await serviceDb()
    .from('staff_audit_logs')
    .select('action')
    .eq('target_profile_id', pending.id)
    .single();
  expect(log?.action).toBe('registration_approved');

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await loginAndOpenDashboard(userPage, pending.email, pending.password);
  await expect(sidebarTab(userPage, 'Owners')).toBeVisible();
  await expect(sidebarTab(userPage, 'Approvals')).toHaveCount(0);
  await userContext.close();
});

test('staff disapproves a registration and the user stays blocked', async ({ page, browser }) => {
  const pending = await createAccount({ requestedRole: 'owner' });
  created.push(pending.id);

  await openApprovals(page, 'staff');
  const row = page.getByTestId(`registration-${pending.email}`);
  await row.getByRole('button', { name: 'Disapprove' }).click();
  await page.getByRole('button', { name: 'Disapprove registration' }).click();
  await expect(row).toHaveCount(0, { timeout: 30000 });
  expect((await getProfile(pending.id)).approval_status).toBe('rejected');

  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await loginThroughUi(userPage, pending.email, pending.password);
  await expect(userPage.getByText('Your registration was not approved.')).toBeVisible({ timeout: 30000 });
  await userContext.close();
});

test('staff cannot approve an Admin request', async ({ page }) => {
  const pending = await createAccount({ requestedRole: 'admin' });
  created.push(pending.id);

  await openApprovals(page, 'staff');
  const row = page.getByTestId(`registration-${pending.email}`);
  await expect(row.getByText('Only an Admin can review Admin requests.')).toBeVisible({ timeout: 30000 });
  await expect(row.getByRole('button', { name: 'Approve', exact: true })).toBeDisabled();
  await expect(row.locator('select option[value="admin"]')).toHaveCount(0);
  expect((await getProfile(pending.id)).approval_status).toBe('pending');
});

test('a signed-in pending user without a role picks one on the account-status page', async ({ page }) => {
  const pending = await createAccount({}); // like a first-time Google sign-in
  created.push(pending.id);

  // Sign in through the real confirmation callback (token_hash flow).
  const { data, error } = await serviceDb().auth.admin.generateLink({ type: 'magiclink', email: pending.email });
  expect(error).toBeNull();
  await page.goto(`/auth/callback?token_hash=${data.properties!.hashed_token}&type=magiclink&next=/dashboard`);

  await page.waitForURL('**/account-status', { timeout: 60000 });
  await expect(page.getByText('One more step')).toBeVisible();
  await page.locator('label[for="account-role-veterinarian"]').click();
  await page.getByRole('button', { name: 'Send for approval' }).click();

  await expect(page.getByText('Waiting for approval', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Requested role:')).toContainText('Veterinarian');
  expect((await getProfile(pending.id)).requested_role).toBe('veterinarian');

  // Dashboard stays closed while pending.
  await page.goto('/dashboard');
  await page.waitForURL('**/account-status', { timeout: 30000 });
});
