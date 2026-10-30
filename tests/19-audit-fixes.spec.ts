import { test, expect, type Page } from '@playwright/test';
import {
  accounts,
  createAccount,
  createBookedAppointment,
  deleteAccounts,
  loginAndOpenDashboard,
  serviceDb,
  sidebarTab,
  userDb,
} from './flows/accounts';

// Audit fixes (docs/revisions/audit-report-oct-30.md). Each test names the item it covers.
test.describe.configure({ mode: 'serial', timeout: 120000 });

const created: string[] = [];
const pets: string[] = [];
const appointments: string[] = [];
const schedules: string[] = [];
let owner: { id: string; email: string; password: string };
let vetId: string;

async function profileId(email: string) {
  const { data } = await serviceDb().from('profiles').select('id').ilike('email', email).single();
  return data!.id;
}

/** A pet + appointment owned by `owner`, in the given status (service role). */
async function appointmentInStatus(status: 'booked' | 'diagnosed' | 'cancelled' | 'paid', date = '2030-03-03') {
  const ids = await createBookedAppointment(owner.id, date);
  pets.push(ids.petId);
  appointments.push(ids.appointmentId);
  if (status !== 'booked') await serviceDb().from('appointments').update({ status }).eq('id', ids.appointmentId);
  return ids;
}

async function encounterFor(appointmentId: string, petId: string) {
  const { data, error } = await serviceDb()
    .from('encounters')
    .insert({ appointment_id: appointmentId, pet_id: petId, veterinarian_id: vetId, status: 'signed' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

test.beforeAll(async () => {
  test.setTimeout(120000);
  owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Audit Owner' });
  created.push(owner.id);
  vetId = await profileId(accounts.vet.email);
});

test.afterAll(async () => {
  test.setTimeout(120000);
  const db = serviceDb();
  if (appointments.length) {
    const { data: encs } = await db.from('encounters').select('id').in('appointment_id', appointments);
    const encIds = (encs ?? []).map((e) => e.id);
    const { data: invs } = await db.from('invoices').select('id').or(`owner_id.eq.${owner.id}${encIds.length ? `,encounter_id.in.(${encIds.join(',')})` : ''}`);
    const invIds = (invs ?? []).map((i) => i.id);
    if (invIds.length) {
      await db.from('payments').delete().in('invoice_id', invIds);
      await db.from('invoice_items').delete().in('invoice_id', invIds);
      await db.from('invoices').delete().in('id', invIds);
    }
    if (encIds.length) await db.from('encounters').delete().in('id', encIds);
    await db.from('appointment_status_history').delete().in('appointment_id', appointments);
    await db.from('appointments').delete().in('id', appointments);
  }
  if (schedules.length) {
    await db.from('schedule_audit_logs').delete().in('target_schedule_id', schedules);
    await db.from('appointment_schedules').delete().in('id', schedules);
  }
  if (pets.length) {
    await db.from('pet_owners').delete().in('pet_id', pets);
    await db.from('pets').delete().in('id', pets);
  }
  await deleteAccounts(created);
});

test.describe('database rules', () => {
  test('H1: an owner cannot insert an appointment directly (must use the capacity-checked booking)', async () => {
    const { petId } = await appointmentInStatus('booked');
    const client = await userDb(owner.email, owner.password);
    const { error } = await client
      .from('appointments')
      .insert({ pet_id: petId, owner_id: owner.id, status: 'booked', preferred_date: '2031-01-01', preferred_time: '09:00:00' });
    expect(error?.message).toMatch(/row-level security/);
  });

  test('H2: users cannot write appointment history themselves', async () => {
    const { appointmentId } = await appointmentInStatus('booked');
    const client = await userDb(owner.email, owner.password);
    const { error } = await client
      .from('appointment_status_history')
      .insert({ appointment_id: appointmentId, previous_status: 'booked', new_status: 'paid', changed_by_id: owner.id });
    expect(error?.message).toMatch(/row-level security/);
  });

  test('H3: vets cannot create schedules; staff can', async () => {
    const row = { specific_date: '2031-02-02', day_of_week: 0, start_time: '09:00:00', end_time: '10:00:00', max_capacity: 1, status: 'active' as const };
    const vet = await userDb(accounts.vet.email, accounts.vet.password);
    const { error: vetError } = await vet.from('appointment_schedules').insert(row);
    expect(vetError?.message).toMatch(/row-level security/);

    const staff = await userDb(accounts.staff.email, accounts.staff.password);
    const { data, error } = await staff.from('appointment_schedules').insert(row).select('id').single();
    expect(error).toBeNull();
    schedules.push(data!.id);
  });

  test('M9: schedules reject end-before-start, capacity 0, and a second schedule for the same slot', async () => {
    const staff = await userDb(accounts.staff.email, accounts.staff.password);
    const base = { specific_date: '2031-02-03', day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00', max_capacity: 2, status: 'active' as const };

    const backwards = await staff.from('appointment_schedules').insert({ ...base, start_time: '12:00:00', end_time: '09:00:00' });
    expect(backwards.error?.code).toBe('23514');
    const zero = await staff.from('appointment_schedules').insert({ ...base, max_capacity: 0 });
    expect(zero.error?.code).toBe('23514');

    const first = await staff.from('appointment_schedules').insert(base).select('id').single();
    expect(first.error).toBeNull();
    schedules.push(first.data!.id);
    const duplicate = await staff.from('appointment_schedules').insert(base);
    expect(duplicate.error?.code).toBe('23505');
  });

  test('M1: owners cannot read clinic staff contact details, only names', async () => {
    const client = await userDb(owner.email, owner.password);
    const { data: staffRows } = await client.from('profiles').select('id, phone, address').in('role', ['admin', 'staff', 'veterinarian']);
    expect(staffRows ?? []).toHaveLength(0);

    const { data: names, error } = await client.rpc('clinic_member_names', { p_ids: [vetId] });
    expect(error).toBeNull();
    expect(names).toHaveLength(1);
    expect(Object.keys(names![0]).sort()).toEqual(['full_name', 'id', 'role']);

    // The clinic still sees its own team.
    const vet = await userDb(accounts.vet.email, accounts.vet.password);
    const { data: team } = await vet.from('profiles').select('id').in('role', ['admin', 'staff']);
    expect((team ?? []).length).toBeGreaterThan(0);
  });

  test('M2: vets cannot create invoices; staff can', async () => {
    const vet = await userDb(accounts.vet.email, accounts.vet.password);
    const { error: vetError } = await vet.from('invoices').insert({ owner_id: owner.id, status: 'draft', invoice_number: '' });
    expect(vetError?.message).toMatch(/row-level security/);

    const staff = await userDb(accounts.staff.email, accounts.staff.password);
    const { error } = await staff.from('invoices').insert({ owner_id: owner.id, status: 'draft', invoice_number: '' }).select('id').single();
    expect(error).toBeNull();
  });

  test('H4: an appointment can have only one encounter', async () => {
    const { appointmentId, petId } = await appointmentInStatus('booked');
    await encounterFor(appointmentId, petId);
    const { error } = await serviceDb()
      .from('encounters')
      .insert({ appointment_id: appointmentId, pet_id: petId, veterinarian_id: vetId, status: 'draft' });
    expect(error?.code).toBe('23505');
  });

  test('M8: Charge & Mark Paid is all-or-nothing and cannot bill twice', async () => {
    const booked = await appointmentInStatus('booked');
    const staff = await userDb(accounts.staff.email, accounts.staff.password);
    const args = { p_description: 'Consultation', p_amount: 500, p_is_vatable: true, p_method: 'cash' as const };

    const notSigned = await staff.rpc('quick_bill_appointment', { ...args, p_appointment_id: booked.appointmentId });
    expect(notSigned.error?.message).toContain('Sign the encounter before charging');

    const diagnosed = await appointmentInStatus('diagnosed');
    await encounterFor(diagnosed.appointmentId, diagnosed.petId);

    const vet = await userDb(accounts.vet.email, accounts.vet.password);
    const vetTry = await vet.rpc('quick_bill_appointment', { ...args, p_appointment_id: diagnosed.appointmentId });
    expect(vetTry.error?.message).toContain('Only Admin or Staff');

    const first = await staff.rpc('quick_bill_appointment', { ...args, p_appointment_id: diagnosed.appointmentId });
    expect(first.error).toBeNull();
    const { invoice_id, receipt_number } = first.data![0];
    expect(receipt_number).toMatch(/^RCPT-/);

    const db = serviceDb();
    const { data: invoice } = await db.from('invoices').select('status, total_amount').eq('id', invoice_id).single();
    expect(invoice).toMatchObject({ status: 'paid', total_amount: 560 });
    const { data: appt } = await db.from('appointments').select('status').eq('id', diagnosed.appointmentId).single();
    expect(appt?.status).toBe('paid');

    const second = await staff.rpc('quick_bill_appointment', { ...args, p_appointment_id: diagnosed.appointmentId });
    expect(second.error?.message).toContain('already paid');
  });

  test('M3: paying an invoice from the Billing page also marks its appointment Paid', async () => {
    const diagnosed = await appointmentInStatus('diagnosed');
    const encounterId = await encounterFor(diagnosed.appointmentId, diagnosed.petId);
    const staff = await userDb(accounts.staff.email, accounts.staff.password);
    const { data: invoice } = await staff
      .from('invoices')
      .insert({ owner_id: owner.id, encounter_id: encounterId, status: 'unpaid', total_amount: 100, invoice_number: '' })
      .select('id')
      .single();
    await staff.from('invoices').update({ status: 'paid' }).eq('id', invoice!.id);

    const { data: appt } = await serviceDb().from('appointments').select('status').eq('id', diagnosed.appointmentId).single();
    expect(appt?.status).toBe('paid');
  });
});

test.describe('screens', () => {
  async function openTab(page: Page, who: keyof typeof accounts, tab: string) {
    await loginAndOpenDashboard(page, accounts[who].email, accounts[who].password);
    await sidebarTab(page, tab).click();
  }

  test('H3: vets see the schedule read-only; staff can add schedules', async ({ page }) => {
    await openTab(page, 'vet', 'Schedule');
    await expect(page.getByTestId('schedule-read-only')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#add-schedule-btn')).toHaveCount(0);

    await page.goto('/dashboard/schedules/new');
    await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 30000 });
  });

  test('H3: staff still manage schedules', async ({ page }) => {
    await openTab(page, 'staff', 'Schedule');
    await expect(page.locator('#add-schedule-btn')).toBeVisible({ timeout: 30000 });
  });

  test('M2: vets have no Billing tab and cannot open billing pages', async ({ page }) => {
    await loginAndOpenDashboard(page, accounts.vet.email, accounts.vet.password);
    await expect(sidebarTab(page, 'Billing')).toHaveCount(0);
    await page.goto('/dashboard/billing');
    await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 30000 });
  });

  test('H4: no Start Encounter on a cancelled appointment; shown on a booked one', async ({ page }) => {
    const cancelled = await appointmentInStatus('cancelled', '2030-04-04');
    const booked = await appointmentInStatus('booked', '2030-04-05');
    await loginAndOpenDashboard(page, accounts.vet.email, accounts.vet.password);

    await page.goto(`/dashboard/appointments/${cancelled.appointmentId}`);
    await expect(page.getByRole('button', { name: 'Print Details' })).toBeVisible({ timeout: 60000 });
    await expect(page.getByRole('button', { name: /Start Encounter/ })).toHaveCount(0);
    // Vets do not bill.
    await expect(page.getByRole('button', { name: /Charge & Mark Paid/ })).toHaveCount(0);

    await page.goto(`/dashboard/appointments/${booked.appointmentId}`);
    await expect(page.getByRole('button', { name: /Start Encounter/ })).toBeVisible({ timeout: 60000 });
  });

  test('M4: the owner overview shows upcoming visits, not past paid ones', async ({ page }) => {
    const lonelyOwner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Upcoming Owner' });
    created.push(lonelyOwner.id);
    const past = await createBookedAppointment(lonelyOwner.id, '2020-01-15');
    pets.push(past.petId);
    appointments.push(past.appointmentId);
    await serviceDb().from('appointments').update({ status: 'paid' }).eq('id', past.appointmentId);

    await loginAndOpenDashboard(page, lonelyOwner.email, lonelyOwner.password);
    await expect(page.getByText('No upcoming visits scheduled')).toBeVisible({ timeout: 30000 });

    const future = await createBookedAppointment(lonelyOwner.id, '2030-05-05');
    pets.push(future.petId);
    appointments.push(future.appointmentId);
    await page.reload();
    // Wait for the card itself (the empty message is also absent while the page loads).
    await expect(page.getByText('booked', { exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('No upcoming visits scheduled')).toHaveCount(0);
  });
});
