import { test, expect } from '@playwright/test';
import { accounts, createAccount, deleteAccounts, loginAndOpenDashboard, serviceDb, sidebarTab, userDb } from './flows/accounts';

// Trash / Restore for pets (Admin + Staff) and team members (Admin); permanent delete needs typing DELETE.
test.describe.configure({ mode: 'serial', timeout: 180000 });

const accountsToDelete: string[] = [];
const petsToDelete: string[] = [];
let owner: { id: string; email: string; password: string };
let petName: string;
let petId: string;

test.beforeAll(async () => {
  owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Pet Trash Owner' });
  accountsToDelete.push(owner.id);
  petName = `TrashPet${Date.now()}`;
  const client = await userDb(owner.email, owner.password);
  const { data } = await client.rpc('create_owned_pet', { p_name: petName, p_species: 'dog' });
  petId = data!.id;
  petsToDelete.push(petId);
});

test.afterAll(async () => {
  const db = serviceDb();
  await db.from('pet_owners').delete().in('pet_id', petsToDelete);
  await db.from('pets').delete().in('id', petsToDelete);
  await deleteAccounts(accountsToDelete);
});

test('staff moves a pet to Trash (hidden, cannot be booked) and restores it', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.staff.email, accounts.staff.password);
  await sidebarTab(page, 'Pets').click();
  await page.getByPlaceholder(/Search by name, species, or breed/).fill(petName);
  await page.getByTestId(`trash-pet-${petName}`).click();
  await page.getByRole('button', { name: 'Move to Trash' }).last().click();
  await expect(page.getByText('Moved to Trash').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId(`trash-pet-${petName}`)).toHaveCount(0);

  // Hidden from the owner and refused for booking.
  const ownerClient = await userDb(owner.email, owner.password);
  const { data: visible } = await ownerClient.from('pets').select('id').eq('id', petId).is('deleted_at', null);
  expect(visible).toHaveLength(0);
  const { error } = await ownerClient.rpc('book_appointment', {
    p_pet_id: petId, p_service_id: null as never, p_preferred_date: '2031-01-01', p_preferred_time: '09:00:00+00',
  });
  expect(error).not.toBeNull();

  await page.getByTestId('view-pet-trash').click();
  const card = page.getByTestId(`trashed-pet-${petName}`);
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(card.getByTestId('purge-pet')).toHaveCount(0); // staff cannot purge
  await card.getByTestId('restore-pet').click();
  await expect(page.getByText('Pet restored')).toBeVisible({ timeout: 30000 });
  expect((await serviceDb().from('pets').select('deleted_at').eq('id', petId).single()).data!.deleted_at).toBeNull();
});

test('admin deletes a pet permanently only after typing DELETE', async ({ page }) => {
  const staff = await userDb(accounts.staff.email, accounts.staff.password);
  const admin = await userDb(accounts.admin.email, accounts.admin.password);
  expect((await admin.rpc('purge_pet', { p_pet_id: petId })).error?.message).toContain('Move the pet to Trash first.');
  await staff.rpc('trash_pet', { p_pet_id: petId });
  expect((await staff.rpc('purge_pet', { p_pet_id: petId })).error?.message).toContain('Only an Administrator');

  await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
  await sidebarTab(page, 'Pets').click();
  await page.getByTestId('view-pet-trash').click();
  await page.getByTestId(`trashed-pet-${petName}`).getByTestId('purge-pet').click();
  await expect(page.getByText(`Are you sure you want to permanently delete ${petName}?`)).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Delete pet permanently' });
  await expect(confirm).toBeDisabled();
  await page.getByTestId('confirm-typed-input').fill('delete');
  await expect(confirm).toBeDisabled();
  await page.getByTestId('confirm-typed-input').fill('DELETE');
  await confirm.click();
  await expect(page.getByText('Pet deleted permanently')).toBeVisible({ timeout: 30000 });
  expect((await serviceDb().from('pets').select('id', { count: 'exact', head: true }).eq('id', petId)).count).toBe(0);
});

test('admin moves a team member to Trash, restores, then deletes permanently', async ({ page }) => {
  const member = await createAccount({ requestedRole: 'staff', approveAs: 'staff', fullName: 'E2E Team Trash' });
  accountsToDelete.push(member.id);
  const db = serviceDb();

  await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
  await page.goto('/dashboard/team');
  const row = page.getByTestId(`staff-card-${member.email}`);
  await row.getByTestId('trash-staff').click();
  await page.getByRole('button', { name: 'Move to Trash' }).last().click();
  const trashed = page.getByTestId(`trashed-staff-${member.email}`);
  await expect(trashed).toBeVisible({ timeout: 30000 });
  await expect(row).toHaveCount(0);
  expect((await db.from('profiles').select('is_active, deleted_at').eq('id', member.id).single()).data!.is_active).toBe(false);

  await trashed.getByTestId('restore-staff').click();
  await expect(page.getByTestId(`staff-card-${member.email}`)).toBeVisible({ timeout: 30000 });
  expect((await db.from('profiles').select('is_active, deleted_at').eq('id', member.id).single()).data).toEqual({ is_active: true, deleted_at: null });

  await page.getByTestId(`staff-card-${member.email}`).getByTestId('trash-staff').click();
  await page.getByRole('button', { name: 'Move to Trash' }).last().click();
  await page.getByTestId(`trashed-staff-${member.email}`).getByTestId('purge-staff').click();
  await expect(page.getByText(/Are you sure you want to permanently delete/)).toBeVisible();
  await page.getByTestId('confirm-typed-input').fill('DELETE');
  await page.getByRole('button', { name: 'Delete permanently' }).last().click();
  await expect(page.getByTestId(`trashed-staff-${member.email}`)).toHaveCount(0, { timeout: 30000 });
  expect((await db.auth.admin.getUserById(member.id)).data.user).toBeNull();
});

test('rules: only Admin manages team Trash; members with patient records stay in Trash; no self-trash', async () => {
  const staff = await userDb(accounts.staff.email, accounts.staff.password);
  const admin = await userDb(accounts.admin.email, accounts.admin.password);
  const db = serviceDb();
  const { data: vet } = await db.from('profiles').select('id').eq('email', accounts.vet.email.toLowerCase()).single();
  const { data: me } = await db.from('profiles').select('id').eq('email', accounts.admin.email.toLowerCase()).single();

  expect((await staff.rpc('trash_team_member', { p_profile_id: vet!.id })).error?.message).toContain('Only an Administrator');
  expect((await admin.rpc('trash_team_member', { p_profile_id: me!.id })).error?.message).toContain('cannot move your own account');

  // A vet who wrote records: purge refused, then restored so the shared test vet keeps working.
  const writer = await createAccount({ requestedRole: 'veterinarian', approveAs: 'veterinarian', fullName: 'E2E Record Writer' });
  accountsToDelete.push(writer.id);
  const { data: pet } = await db.from('pets').insert({ name: 'Writer Pet', species: 'dog' }).select('id').single();
  petsToDelete.push(pet!.id);
  const { data: enc } = await db.from('encounters').insert({ pet_id: pet!.id, veterinarian_id: writer.id, status: 'draft' }).select('id').single();
  await admin.rpc('trash_team_member', { p_profile_id: writer.id });
  const { error } = await admin.rpc('purge_team_member', { p_profile_id: writer.id });
  expect(error?.message).toContain('Keep them in Trash instead of deleting.');
  await db.from('encounters').delete().eq('id', enc!.id);
});
