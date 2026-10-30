import { test, expect, type Page } from '@playwright/test';
import { accounts, createAccount, deleteAccounts, loginAndOpenDashboard, serviceDb, sidebarTab, userDb } from './flows/accounts';

// Admin and Staff approve pending bookings within the schedule's limit (3); vets cannot.
test.describe.configure({ mode: 'serial', timeout: 180000 });
test.use({ timezoneId: 'Asia/Manila' });

const CAPACITY = 3;
const created: string[] = [];
const petIds: string[] = [];
let scheduleId: string;
let bookingDate: string;
const owners: Array<{ id: string; email: string; password: string; petName: string; appointmentId: string }> = [];

function clinicDate(offsetDays: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  test.setTimeout(180000);
  const db = serviceDb();
  for (let offset = 150; offset < 260 && !bookingDate; offset++) {
    const date = clinicDate(offset);
    const { count } = await db.from('appointment_schedules').select('id', { count: 'exact', head: true }).eq('specific_date', date);
    if (!count) bookingDate = date;
  }
  const { data: schedule, error } = await db
    .from('appointment_schedules')
    .insert({
      specific_date: bookingDate,
      day_of_week: new Date(`${bookingDate}T00:00:00Z`).getUTCDay(),
      start_time: '09:00:00',
      end_time: '12:00:00',
      max_capacity: CAPACITY,
      is_recurring: false,
      is_closed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !schedule) throw error;
  scheduleId = schedule.id;

  const { data: service } = await db.from('services').select('id').eq('slug', 'general-consultation').single();
  const stamp = Date.now();
  for (let i = 1; i <= CAPACITY + 1; i++) {
    const account = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: `E2E Approval Owner ${i}` });
    created.push(account.id);
    const client = await userDb(account.email, account.password);
    const petName = `ApproveFlow ${stamp} ${i}`;
    const { data: pet, error: petError } = await client.rpc('create_owned_pet', { p_name: petName, p_species: 'dog' });
    if (petError || !pet) throw petError;
    petIds.push(pet.id);
    const { data: appt, error: bookError } = await client.rpc('book_appointment', {
      p_pet_id: pet.id,
      p_service_id: service!.id,
      p_preferred_date: bookingDate,
      p_preferred_time: '09:00:00+00',
      p_reason: 'Approval flow test',
    });
    if (bookError || !appt) throw bookError;
    owners.push({ ...account, petName, appointmentId: appt.id });
  }
});

test.afterAll(async () => {
  test.setTimeout(120000);
  const db = serviceDb();
  const ids = owners.map((o) => o.appointmentId);
  if (ids.length) {
    await db.from('appointment_status_history').delete().in('appointment_id', ids);
    await db.from('appointments').delete().in('id', ids);
  }
  if (scheduleId) await db.from('appointment_schedules').delete().eq('id', scheduleId);
  if (petIds.length) {
    await db.from('pet_owners').delete().in('pet_id', petIds);
    await db.from('pets').delete().in('id', petIds);
  }
  await deleteAccounts(created);
});

async function openAppointments(page: Page, email: string, password: string) {
  await loginAndOpenDashboard(page, email, password);
  await sidebarTab(page, 'Appointments').click();
  await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible({ timeout: 30000 });
}

function card(page: Page, appointmentId: string) {
  return page.getByTestId(`appointment-card-${appointmentId}`);
}

async function showApprovalFlow(page: Page) {
  await page.getByPlaceholder(/Search pet, service, owner/).fill('ApproveFlow');
}

test('owner sees the request as Pending approval', async ({ page }) => {
  await openAppointments(page, owners[0].email, owners[0].password);
  const ownCard = card(page, owners[0].appointmentId);
  await expect(ownCard.getByTestId('appointment-status')).toHaveText('Pending approval', { timeout: 30000 });
  await expect(ownCard.getByTestId('pending-note')).toContainText('Waiting for the clinic to approve');
  await expect(ownCard.getByTestId('approve-appointment')).toHaveCount(0);
});

test('veterinarian sees the Approve button greyed out', async ({ page }) => {
  await openAppointments(page, accounts.vet.email, accounts.vet.password);
  await showApprovalFlow(page);
  const vetCard = card(page, owners[0].appointmentId);
  await expect(vetCard).toBeVisible({ timeout: 30000 });
  await expect(vetCard.getByTestId('approve-appointment')).toBeDisabled();
  await expect(vetCard.getByTestId('approve-appointment')).toHaveAttribute('title', 'Only Admin or Staff can approve appointments');
});

test('staff can approve, and the badge turns Approved', async ({ page }) => {
  await openAppointments(page, accounts.staff.email, accounts.staff.password);
  await expect(page.getByTestId('pending-approvals-banner')).toBeVisible({ timeout: 30000 });
  await showApprovalFlow(page);
  const first = card(page, owners[0].appointmentId);
  await expect(first.getByTestId('approve-appointment')).toHaveText(`Approve (0/${CAPACITY} approved)`, { timeout: 30000 });
  await first.getByTestId('approve-appointment').click();
  await expect(page.getByText('Appointment approved').first()).toBeVisible({ timeout: 30000 });
  await expect(first.getByTestId('appointment-status')).toHaveText('Approved');
  await expect(first.getByTestId('approve-appointment')).toHaveCount(0);
});

test(`admin approves up to the limit of ${CAPACITY}; the next one shows Slot full`, async ({ page }) => {
  await openAppointments(page, accounts.admin.email, accounts.admin.password);
  await showApprovalFlow(page);
  for (const [i, owner] of owners.slice(1, CAPACITY).entries()) {
    const c = card(page, owner.appointmentId);
    await expect(c.getByTestId('approve-appointment')).toHaveText(`Approve (${i + 1}/${CAPACITY} approved)`, { timeout: 30000 });
    await c.getByTestId('approve-appointment').click();
    await expect(c.getByTestId('appointment-status')).toHaveText('Approved', { timeout: 30000 });
  }

  const extra = card(page, owners[CAPACITY].appointmentId);
  await expect(extra.getByTestId('approve-appointment')).toHaveText(`Slot full (${CAPACITY}/${CAPACITY})`, { timeout: 30000 });
  await expect(extra.getByTestId('approve-appointment')).toBeDisabled();

  // The server refuses too, even if the screen was stale.
  const admin = await userDb(accounts.admin.email, accounts.admin.password);
  const { error } = await admin.rpc('approve_appointment', { p_appointment_id: owners[CAPACITY].appointmentId });
  expect(error?.message).toContain(`This schedule already has ${CAPACITY} of ${CAPACITY} appointments approved.`);

  // The Approved filter lists the approved ones.
  await page.getByTestId('status-filter-booked').click();
  await expect(card(page, owners[0].appointmentId)).toBeVisible();
  await expect(extra).toHaveCount(0);
});

test('detail page: approved shows the Approved badge, pending shows the approval panel', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
  await page.goto(`/dashboard/appointments/${owners[0].appointmentId}`);
  await expect(page.getByTestId('appointment-status').first()).toHaveText('Approved', { timeout: 60000 });
  await expect(page.getByTestId('approval-panel')).toHaveCount(0);

  await page.goto(`/dashboard/appointments/${owners[CAPACITY].appointmentId}`);
  await expect(page.getByTestId('approval-panel')).toBeVisible({ timeout: 60000 });
  await expect(page.getByTestId('approval-panel')).toContainText(`${CAPACITY} of ${CAPACITY} places in this schedule are approved.`);
  await expect(page.getByTestId('approve-appointment')).toBeDisabled();
});

test('an encounter cannot start until the appointment is approved', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.vet.email, accounts.vet.password);
  await page.goto(`/dashboard/appointments/${owners[CAPACITY].appointmentId}`);
  await expect(page.getByTestId('start-encounter-locked')).toBeDisabled({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Start Encounter', exact: true })).toHaveCount(0);

  // The database refuses a direct insert too.
  const vet = await userDb(accounts.vet.email, accounts.vet.password);
  const { data: vetProfile } = await serviceDb().from('profiles').select('id').eq('email', accounts.vet.email.toLowerCase()).single();
  const { error: insertError } = await vet.from('encounters').insert({
    appointment_id: owners[CAPACITY].appointmentId,
    pet_id: petIds[CAPACITY],
    veterinarian_id: vetProfile!.id,
    status: 'draft',
  });
  expect(insertError?.message).toContain('Admin or Staff must approve it before an encounter can start.');

  const { count } = await serviceDb()
    .from('encounters')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', owners[CAPACITY].appointmentId);
  expect(count).toBe(0);

  // Once approved (a place freed by cancelling one), Start Encounter appears.
  const db = serviceDb();
  await db.from('appointments').update({ status: 'cancelled' }).eq('id', owners[0].appointmentId);
  const staff = await userDb(accounts.staff.email, accounts.staff.password);
  const { error } = await staff.rpc('approve_appointment', { p_appointment_id: owners[CAPACITY].appointmentId });
  expect(error).toBeNull();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Start Encounter', exact: true })).toBeVisible({ timeout: 60000 });
});
