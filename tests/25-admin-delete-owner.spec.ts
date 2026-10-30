import { test, expect } from '@playwright/test';
import { accounts, createAccount, createBookedAppointment, deleteAccounts, loginAndOpenDashboard, serviceDb, sidebarTab, userDb } from './flows/accounts';

// Admin can permanently delete an owner and all of their data from the Owners tab.
test.describe.configure({ mode: 'serial', timeout: 180000 });

const leftovers: string[] = [];
test.afterAll(async () => {
  await deleteAccounts(leftovers);
});

test('only Admin sees the delete option; staff and vets cannot call it', async ({ page }) => {
  const owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Keep Me' });
  leftovers.push(owner.id);

  await loginAndOpenDashboard(page, accounts.staff.email, accounts.staff.password);
  await sidebarTab(page, 'Owners').click();
  await page.getByPlaceholder(/Search by owner name/).fill(owner.email);
  await expect(page.getByTestId(`owner-card-${owner.email}`)).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('delete-owner')).toHaveCount(0);

  for (const role of ['staff', 'vet'] as const) {
    const client = await userDb(accounts[role].email, accounts[role].password);
    const { error } = await client.rpc('admin_delete_owner', { p_owner_id: owner.id });
    expect(error?.message).toContain('Only an Administrator can delete owner accounts.');
  }
  const admin = await userDb(accounts.admin.email, accounts.admin.password);
  const { data: staffProfile } = await serviceDb().from('profiles').select('id').eq('email', accounts.staff.email.toLowerCase()).single();
  const { error: staffTarget } = await admin.rpc('admin_delete_owner', { p_owner_id: staffProfile!.id });
  expect(staffTarget?.message).toContain('Only pet-owner accounts can be deleted here.');
});

test('admin deletes an owner with pets, visits and billing; everything is gone', async ({ page }) => {
  const db = serviceDb();
  const owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Delete From Owners Tab' });
  const { petId, appointmentId } = await createBookedAppointment(owner.id, '2030-02-02');
  const { data: invoice } = await db.from('invoices').insert({ owner_id: owner.id, status: 'unpaid', total_amount: 100 }).select('id').single();
  await db.from('invoice_items').insert({ invoice_id: invoice!.id, description: 'Consult', quantity: 1, unit_price: 100 });

  await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
  await sidebarTab(page, 'Owners').click();
  await page.getByPlaceholder(/Search by owner name/).fill(owner.email);
  const cardEl = page.getByTestId(`owner-card-${owner.email}`);
  await expect(cardEl).toBeVisible({ timeout: 30000 });
  await cardEl.getByTestId('delete-owner').click();
  await page.getByRole('button', { name: 'Delete owner permanently' }).click();
  await expect(page.getByText('Owner deleted')).toBeVisible({ timeout: 30000 });
  await expect(cardEl).toHaveCount(0);

  const counts = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('id', owner.id),
    db.from('pets').select('id', { count: 'exact', head: true }).eq('id', petId),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('id', appointmentId),
    db.from('invoices').select('id', { count: 'exact', head: true }).eq('id', invoice!.id),
  ]);
  for (const { count } of counts) expect(count).toBe(0);
  const { data: authUser } = await db.auth.admin.getUserById(owner.id);
  expect(authUser.user).toBeNull();
});
