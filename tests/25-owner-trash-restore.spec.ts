import { test, expect, type Page } from '@playwright/test';
import { accounts, createAccount, createBookedAppointment, deleteAccounts, loginAndOpenDashboard, serviceDb, sidebarTab, userDb } from './flows/accounts';

// Owners tab: Move to Trash / Restore (Admin + Staff); permanent delete only from Trash (Admin).
test.describe.configure({ mode: 'serial', timeout: 180000 });

const leftovers: string[] = [];
test.afterAll(async () => {
  await deleteAccounts(leftovers);
});

async function openOwners(page: Page, who: 'admin' | 'staff') {
  await loginAndOpenDashboard(page, accounts[who].email, accounts[who].password);
  await sidebarTab(page, 'Owners').click();
  await expect(page.getByRole('heading', { name: 'Owner Directory' })).toBeVisible({ timeout: 30000 });
}

test('staff moves an owner to Trash and restores them; nothing is lost', async ({ page }) => {
  const db = serviceDb();
  const owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Trash Restore' });
  leftovers.push(owner.id);
  const { petId } = await createBookedAppointment(owner.id, '2030-03-03');

  await openOwners(page, 'staff');
  await page.getByPlaceholder(/Search by owner name/).fill(owner.email);
  const card = page.getByTestId(`owner-card-${owner.email}`);
  await card.getByTestId('trash-owner').click();
  await page.getByRole('button', { name: 'Move to Trash' }).last().click();
  await expect(page.getByText('Moved to Trash').first()).toBeVisible({ timeout: 30000 });
  await expect(card).toHaveCount(0);

  const trashed = (await db.from('profiles').select('deleted_at, is_active').eq('id', owner.id).single()).data!;
  expect(trashed.deleted_at).not.toBeNull();
  expect(trashed.is_active).toBe(false);

  await page.getByTestId('view-trash').click();
  const trashCard = page.getByTestId(`trashed-owner-${owner.email}`);
  await expect(trashCard).toBeVisible({ timeout: 30000 });
  // Staff can restore but not delete permanently.
  await expect(trashCard.getByTestId('purge-owner')).toHaveCount(0);
  await trashCard.getByTestId('restore-owner').click();
  await expect(page.getByText('Owner restored')).toBeVisible({ timeout: 30000 });

  const restored = (await db.from('profiles').select('deleted_at, is_active').eq('id', owner.id).single()).data!;
  expect(restored).toEqual({ deleted_at: null, is_active: true });
  const { count } = await db.from('pets').select('id', { count: 'exact', head: true }).eq('id', petId);
  expect(count).toBe(1);

  await page.getByTestId('view-directory').click();
  await page.getByPlaceholder(/Search by owner name/).fill(owner.email);
  await expect(page.getByTestId(`owner-card-${owner.email}`)).toBeVisible({ timeout: 30000 });
});

test('permissions: vets cannot trash; permanent delete needs Admin and Trash first', async () => {
  const owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Trash Rules' });
  leftovers.push(owner.id);

  const vet = await userDb(accounts.vet.email, accounts.vet.password);
  expect((await vet.rpc('trash_owner', { p_owner_id: owner.id })).error?.message).toContain('Only Admin or Staff can move owners to Trash.');

  const admin = await userDb(accounts.admin.email, accounts.admin.password);
  expect((await admin.rpc('admin_delete_owner', { p_owner_id: owner.id })).error?.message).toContain('Move the owner to Trash first.');

  const staff = await userDb(accounts.staff.email, accounts.staff.password);
  expect((await staff.rpc('trash_owner', { p_owner_id: owner.id })).error).toBeNull();
  expect((await staff.rpc('admin_delete_owner', { p_owner_id: owner.id })).error?.message).toContain('Only an Administrator can delete owner accounts.');

  const { data: staffProfile } = await serviceDb().from('profiles').select('id').eq('email', accounts.staff.email.toLowerCase()).single();
  expect((await admin.rpc('trash_owner', { p_owner_id: staffProfile!.id })).error?.message).toContain('Only pet-owner accounts can be moved to Trash.');
});

test('admin deletes an owner permanently from Trash; everything is gone', async ({ page }) => {
  const db = serviceDb();
  const owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Purge From Trash' });
  const { petId, appointmentId } = await createBookedAppointment(owner.id, '2030-02-02');
  const { data: invoice } = await db.from('invoices').insert({ owner_id: owner.id, status: 'unpaid', total_amount: 100 } as never).select('id').single();
  const staff = await userDb(accounts.staff.email, accounts.staff.password);
  await staff.rpc('trash_owner', { p_owner_id: owner.id });

  await openOwners(page, 'admin');
  await page.getByTestId('view-trash').click();
  const trashCard = page.getByTestId(`trashed-owner-${owner.email}`);
  await trashCard.getByTestId('purge-owner').click();
  await expect(page.getByText(/Are you sure you want to permanently delete/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete owner permanently' })).toBeDisabled();
  await page.getByTestId('confirm-typed-input').fill('DELETE');
  await page.getByRole('button', { name: 'Delete owner permanently' }).click();
  await expect(page.getByText('Owner deleted permanently')).toBeVisible({ timeout: 30000 });
  await expect(trashCard).toHaveCount(0);

  const counts = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('id', owner.id),
    db.from('pets').select('id', { count: 'exact', head: true }).eq('id', petId),
    db.from('appointments').select('id', { count: 'exact', head: true }).eq('id', appointmentId),
    db.from('invoices').select('id', { count: 'exact', head: true }).eq('id', (invoice as { id: string }).id),
  ]);
  for (const { count } of counts) expect(count).toBe(0);
  expect((await db.auth.admin.getUserById(owner.id)).data.user).toBeNull();
});
