import { test, expect } from '@playwright/test';
import { accounts, createAccount, deleteAccounts, loginAndOpenDashboard, serviceDb, sidebarTab, userDb } from './flows/accounts';

// Bug fix #3 — changing your name, details, or password is recorded in Logs.
test.describe.configure({ mode: 'serial', timeout: 120000 });

const created: string[] = [];
let owner: { id: string; email: string; password: string };
const newName = `E2E Renamed ${Date.now()}`;

test.beforeAll(async () => {
  test.setTimeout(120000);
  owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Logs Owner' });
  created.push(owner.id);
});

test.afterAll(async () => {
  test.setTimeout(120000);
  await deleteAccounts(created);
});

async function accountLogs(id: string) {
  const { data } = await serviceDb()
    .from('staff_audit_logs')
    .select('action, actor_id, previous_values, next_values')
    .eq('target_profile_id', id)
    .in('action', ['profile_updated', 'password_changed', 'email_changed'])
    .order('created_at');
  return data ?? [];
}

test('admin/staff/service changes that do not touch personal details write no account log', async () => {
  // Heartbeats and service-role setup must not flood Logs.
  const client = await userDb(owner.email, owner.password);
  await client.rpc('touch_last_seen');
  expect(await accountLogs(owner.id)).toHaveLength(0);
});

test('changing your name in Settings is logged with the old and new value', async ({ page }) => {
  await loginAndOpenDashboard(page, owner.email, owner.password);
  await page.locator('aside').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#full_name').fill(newName);
  await page.locator('#phone').fill('09171112222');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(page.getByText('Profile updated successfully!')).toBeVisible({ timeout: 30000 });

  const logs = await accountLogs(owner.id);
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    action: 'profile_updated',
    actor_id: owner.id,
    previous_values: { full_name: 'E2E Logs Owner', phone: '09170000000' },
    next_values: { full_name: newName, phone: '09171112222' },
  });
  // Untouched blank fields (e.g. emergency contact) are not reported as changes.
  expect(Object.keys(logs[0].next_values as object).sort()).toEqual(['full_name', 'phone']);
});

test('changing your password is logged (without the password)', async () => {
  const client = await userDb(owner.email, owner.password);
  const { error } = await client.auth.updateUser({ password: `${owner.password}x` });
  expect(error).toBeNull();
  await serviceDb().auth.admin.updateUserById(owner.id, { password: owner.password });

  const actions = (await accountLogs(owner.id)).map((l) => l.action);
  expect(actions.filter((a) => a === 'password_changed').length).toBeGreaterThanOrEqual(1);
});

for (const role of ['admin', 'staff'] as const) {
  test(`${role} sees the change under Logs → Account Changes right away`, async ({ page }) => {
    await loginAndOpenDashboard(page, accounts[role].email, accounts[role].password);
    await sidebarTab(page, 'Logs').click();
    await page.getByRole('button', { name: /Account Changes/ }).click();
    await expect(page.getByText(`${newName} updated their name, phone number.`).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(`${newName} changed their password.`).first()).toBeVisible();
  });
}
