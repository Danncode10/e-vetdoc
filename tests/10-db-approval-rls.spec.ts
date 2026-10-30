import { test, expect } from '@playwright/test';
import { accounts, createAccount, deleteAccounts, getProfile, serviceDb, userDb } from './flows/accounts';

// Stage 1 — database rules for the Staff role and account approval (#1, #2, #3, #4).
// These run against Supabase directly as real users, so they verify RLS itself.
test.describe.configure({ mode: 'serial' });

const created: string[] = [];
let petId: string | null = null;
let appointmentId: string | null = null;

test.afterAll(async () => {
  const db = serviceDb();
  if (appointmentId) await db.from('appointments').delete().eq('id', appointmentId);
  if (petId) {
    await db.from('pet_owners').delete().eq('pet_id', petId);
    await db.from('pets').delete().eq('id', petId);
  }
  await deleteAccounts(created);
});

test('existing accounts were approved by the migration', async () => {
  const { data } = await serviceDb()
    .from('profiles')
    .select('email, approval_status')
    .in('email', [accounts.admin.email, accounts.vet.email, accounts.owner.email].map((e) => e.toLowerCase()));
  expect(data?.length).toBe(3);
  for (const row of data ?? []) expect(row.approval_status).toBe('approved');
});

test('a new sign-up is pending with a least-privilege role', async () => {
  const account = await createAccount({ requestedRole: 'admin' });
  created.push(account.id);
  const profile = await getProfile(account.id);
  expect(profile.approval_status).toBe('pending');
  expect(profile.requested_role).toBe('admin');
  expect(profile.role).toBe('owner');
});

test('a pending user cannot approve themselves or change their role', async () => {
  const account = await createAccount({ requestedRole: 'staff' });
  created.push(account.id);
  const client = await userDb(account.email, account.password);

  const approve = await client.from('profiles').update({ approval_status: 'approved' }).eq('id', account.id);
  expect(approve.error?.message).toContain('Account approval can only be changed by the clinic');

  const promote = await client.from('profiles').update({ role: 'admin' }).eq('id', account.id).select();
  expect(promote.error !== null || (promote.data ?? []).length === 0).toBeTruthy();

  const profile = await getProfile(account.id);
  expect(profile.approval_status).toBe('pending');
  expect(profile.role).toBe('owner');
});

test('a pending user can still pick their requested role (Google sign-ups)', async () => {
  const account = await createAccount({});
  created.push(account.id);
  const client = await userDb(account.email, account.password);
  const { error } = await client.from('profiles').update({ requested_role: 'veterinarian' }).eq('id', account.id);
  expect(error).toBeNull();
  expect((await getProfile(account.id)).requested_role).toBe('veterinarian');
});

test('a pending owner cannot add pets', async () => {
  const account = await createAccount({ requestedRole: 'owner' });
  created.push(account.id);
  const client = await userDb(account.email, account.password);
  const { error } = await client.rpc('create_owned_pet', { p_name: 'Blocked Pet', p_species: 'dog' });
  expect(error?.message).toContain('Only active owners can add pets');
});

test('an approved owner can add pets', async () => {
  const account = await createAccount({ requestedRole: 'owner', approveAs: 'owner' });
  created.push(account.id);
  const client = await userDb(account.email, account.password);
  const { data, error } = await client.rpc('create_owned_pet', { p_name: 'Approved Pet', p_species: 'cat' });
  expect(error).toBeNull();
  petId = data?.id ?? null;
  expect(petId).toBeTruthy();
});

test('staff can read clinic data but cannot change anyone\'s role', async () => {
  const staff = await userDb(accounts.staff.email, accounts.staff.password);

  const owners = await staff.from('profiles').select('id, role').eq('role', 'owner');
  expect(owners.error).toBeNull();
  expect((owners.data ?? []).length).toBeGreaterThan(0);

  const pets = await staff.from('pets').select('id').limit(1);
  expect(pets.error).toBeNull();

  const target = owners.data![0];
  const promote = await staff.from('profiles').update({ role: 'admin' }).eq('id', target.id).select();
  expect(promote.error !== null || (promote.data ?? []).length === 0).toBeTruthy();
  expect((await getProfile(target.id)).role).toBe('owner');
});

test('a veterinarian cannot cancel appointments, staff can', async () => {
  expect(petId).toBeTruthy();
  const db = serviceDb();
  const ownerId = created[created.length - 1];
  const { data: appt, error } = await db
    .from('appointments')
    .insert({ pet_id: petId!, owner_id: ownerId, status: 'booked', preferred_date: '2030-01-15', preferred_time: '09:00:00' })
    .select('id')
    .single();
  expect(error).toBeNull();
  appointmentId = appt!.id;

  const vet = await userDb(accounts.vet.email, accounts.vet.password);
  const vetCancel = await vet.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId).select();
  expect(vetCancel.error !== null || (vetCancel.data ?? []).length === 0).toBeTruthy();

  const staff = await userDb(accounts.staff.email, accounts.staff.password);
  const staffCancel = await staff.from('appointments').update({ status: 'cancelled' }).eq('id', appointmentId).select();
  expect(staffCancel.error).toBeNull();
  expect(staffCancel.data?.[0]?.status).toBe('cancelled');
});
