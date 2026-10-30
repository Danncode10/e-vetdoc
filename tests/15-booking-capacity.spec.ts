import { test, expect, type Page } from '@playwright/test';
import { accounts, createAccount, deleteAccounts, loginAndOpenDashboard, serviceDb, userDb } from './flows/accounts';

// Stage 6 — automatic approval + booking limit (#6).
// The browser runs in Philippine time, like the clinic's users. Run with TZ=UTC
// (`TZ=UTC npx playwright test tests/15-booking-capacity.spec.ts`) to reproduce Vercel.
test.describe.configure({ mode: 'serial', timeout: 120000 });
test.use({ timezoneId: 'Asia/Manila' });

const CAPACITY = 2;
const created: string[] = [];
const petIds: string[] = [];
let scheduleId: string;
let serviceId: string;
let bookingDate: string;
let owners: Array<{ id: string; email: string; password: string; petId: string }> = [];

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function findFreeDate() {
  const db = serviceDb();
  for (let offset = 35; offset < 120; offset++) {
    const candidate = new Date();
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    const date = toDateString(candidate);
    const [{ count: schedules }, { count: appts }] = await Promise.all([
      db.from('appointment_schedules').select('id', { count: 'exact', head: true }).eq('specific_date', date),
      db.from('appointments').select('id', { count: 'exact', head: true }).eq('preferred_date', date),
    ]);
    if (!schedules && !appts) return date;
  }
  throw new Error('No free date found for the booking test.');
}

async function createOwnerWithPet(label: string) {
  const account = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: `E2E ${label}` });
  created.push(account.id);
  const client = await userDb(account.email, account.password);
  const { data: pet, error } = await client.rpc('create_owned_pet', { p_name: `Capacity ${label}`, p_species: 'dog' });
  if (error || !pet) throw error;
  petIds.push(pet.id);
  return { ...account, petId: pet.id };
}

async function book(owner: { email: string; password: string; petId: string }) {
  const client = await userDb(owner.email, owner.password);
  // 9:00–12:00 in Manila, as the booking form sends it (UTC+8 → 01:00–04:00Z).
  return client.rpc('book_appointment', {
    p_pet_id: owner.petId,
    p_service_id: serviceId,
    p_preferred_date: bookingDate,
    p_preferred_time: '09:00:00+00',
    p_scheduled_start: `${bookingDate}T01:00:00Z`,
    p_scheduled_end: `${bookingDate}T04:00:00Z`,
  });
}

test.beforeAll(async () => {
  test.setTimeout(120000);
  bookingDate = await findFreeDate();
  const { data: service } = await serviceDb().from('services').select('id').eq('slug', 'general-consultation').single();
  serviceId = service!.id;
  const { data, error } = await serviceDb()
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
  if (error || !data) throw error;
  scheduleId = data.id;
  owners = await Promise.all(['Owner A', 'Owner B', 'Owner C', 'Owner D'].map(createOwnerWithPet));
});

test.afterAll(async () => {
  test.setTimeout(120000);
  const db = serviceDb();
  const { data: appts } = await db.from('appointments').select('id').eq('preferred_date', bookingDate);
  const apptIds = (appts ?? []).map((a) => a.id);
  if (apptIds.length) {
    await db.from('appointment_status_history').delete().in('appointment_id', apptIds);
    await db.from('appointments').delete().in('id', apptIds);
  }
  if (scheduleId) await db.from('appointment_schedules').delete().eq('id', scheduleId);
  if (petIds.length) {
    await db.from('pet_owners').delete().in('pet_id', petIds);
    await db.from('pets').delete().in('id', petIds);
  }
  await deleteAccounts(created);
});

test('a pending owner cannot book', async () => {
  const pending = await createAccount({ requestedRole: 'owner' });
  created.push(pending.id);
  const client = await userDb(pending.email, pending.password);
  const { error } = await client.rpc('book_appointment', {
    p_pet_id: owners[0].petId,
    p_service_id: serviceId,
    p_preferred_date: bookingDate,
    p_preferred_time: '09:00:00+00',
  });
  expect(error?.message).toContain('Only approved pet owners can book appointments.');
});

test('an owner cannot book for someone else\'s pet', async () => {
  const { error } = await book({ ...owners[0], petId: owners[1].petId });
  expect(error?.message).toContain('You can only book appointments for your own pets.');
});

test('new bookings wait for approval and do not take a place yet', async () => {
  const results = await Promise.all(owners.slice(0, 3).map(book));
  for (const r of results) {
    expect(r.error).toBeNull();
    expect(r.data?.status).toBe('requested');
  }
});

test(`simultaneous approvals never exceed the limit of ${CAPACITY}`, async () => {
  const db = serviceDb();
  const { data: pending } = await db
    .from('appointments')
    .select('id')
    .eq('preferred_date', bookingDate)
    .eq('status', 'requested');
  expect(pending).toHaveLength(3);

  const [admin, staff] = await Promise.all([
    userDb(accounts.admin.email, accounts.admin.password),
    userDb(accounts.staff.email, accounts.staff.password),
  ]);
  const results = await Promise.all(
    pending!.map((a, i) => (i % 2 ? staff : admin).rpc('approve_appointment', { p_appointment_id: a.id })),
  );
  const approved = results.filter((r) => !r.error);
  const rejected = results.filter((r) => r.error);

  expect(approved).toHaveLength(CAPACITY);
  for (const r of approved) expect(r.data?.status).toBe('booked');
  expect(rejected).toHaveLength(1);
  expect(rejected[0].error?.message).toContain(`This schedule already has ${CAPACITY} of ${CAPACITY} appointments approved.`);

  const { count } = await db
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('preferred_date', bookingDate)
    .eq('status', 'booked');
  expect(count).toBe(CAPACITY);
});

test('veterinarians cannot approve, and pending requests cannot be forced to approved', async () => {
  const db = serviceDb();
  const { data: stillPending } = await db
    .from('appointments')
    .select('id')
    .eq('preferred_date', bookingDate)
    .eq('status', 'requested')
    .single();
  const vet = await userDb(accounts.vet.email, accounts.vet.password);
  const { error: vetError } = await vet.rpc('approve_appointment', { p_appointment_id: stillPending!.id });
  expect(vetError?.message).toContain('Only Admin or Staff can approve appointments.');

  const staff = await userDb(accounts.staff.email, accounts.staff.password);
  const { error: bypass } = await staff.from('appointments').update({ status: 'booked' }).eq('id', stillPending!.id);
  expect(bypass?.message).toContain('Pending appointments must be approved with Approve');
});

async function openBookingCalendar(page: Page) {
  const owner = owners[3];
  await loginAndOpenDashboard(page, owner.email, owner.password).catch(async () => {
    // New owners finish their profile on /onboarding first; createAccount already filled it.
    await page.waitForURL('**/dashboard**', { timeout: 60000 });
  });
  await page.goto('/dashboard/appointments/new');
  await page.getByText('Capacity Owner D').first().click();
  await page.getByText('General Consultation').first().click();
  await page.locator('#step-0-next-btn').click();

  const [year, month] = bookingDate.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  for (let i = 0; i < 6; i++) {
    if (await page.getByText(`${monthLabel} ${year}`, { exact: true }).isVisible()) break;
    await page.getByRole('button', { name: 'Next month' }).click();
  }
}

function dayCell(page: Page) {
  const day = Number(bookingDate.split('-')[2]);
  return page.locator('button[title]').filter({ has: page.locator('span', { hasText: new RegExp(`^${day}$`) }) });
}

test('a full day is marked Full on the calendar and cannot be picked', async ({ page }) => {
  await openBookingCalendar(page);
  const cell = dayCell(page);
  await expect(cell).toHaveAttribute('title', 'Fully booked', { timeout: 30000 });
  await expect(cell).toBeDisabled();
  await expect(cell).toContainText('Full');
  await expect(page.locator('#step-1-next-btn')).toBeVisible();
});

test('a 4th owner is rejected by the server even if the page was stale', async () => {
  const { error } = await book(owners[3]);
  expect(error?.message).toContain('This schedule is fully booked. Please choose another date or time.');
});

test('cancelling a booking frees its place and the 4th owner can book through the form', async ({ page }) => {
  const db = serviceDb();
  const { data: appt } = await db
    .from('appointments')
    .select('id')
    .eq('preferred_date', bookingDate)
    .eq('status', 'booked')
    .limit(1)
    .single();
  await db.from('appointments').update({ status: 'cancelled' }).eq('id', appt!.id);

  await openBookingCalendar(page);
  const cell = dayCell(page);
  await expect(cell).toHaveAttribute('title', /^Available:/, { timeout: 30000 });
  await cell.click();
  await page.locator('#step-1-next-btn').click();

  const slot = page.getByRole('button', { name: /9:00 AM - 12:00 PM/ });
  await expect(slot).toBeEnabled({ timeout: 30000 });
  await expect(slot).toContainText(`${CAPACITY - 1}/${CAPACITY} approved`);
  await slot.click();
  await page.locator('#step-2-next-btn').click();
  await page.locator('#appt-reason').fill('Capacity test');
  await page.locator('#submit-appt-btn').click();
  await expect(page.getByText('Appointment requested!')).toBeVisible({ timeout: 30000 });

  const { data: rows } = await db
    .from('appointments')
    .select('status, owner_id')
    .eq('preferred_date', bookingDate)
    .not('status', 'in', '(cancelled,no_show)');
  expect(rows!.filter((r) => r.status === 'booked')).toHaveLength(CAPACITY - 1);
  expect(rows!.find((r) => r.owner_id === owners[3].id)?.status).toBe('requested');
});
