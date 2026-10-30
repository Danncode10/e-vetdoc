import { test, expect, type Page } from '@playwright/test';
import { createAccount, deleteAccounts, loginAndOpenDashboard, serviceDb, userDb } from './flows/accounts';

// Owners can book for today (until the slot ends) and only one appointment per day.
test.describe.configure({ mode: 'serial', timeout: 180000 });
test.use({ timezoneId: 'Asia/Manila' });

/** Clinic (Asia/Manila) date `offsetDays` from today as YYYY-MM-DD, and the current hour. */
function clinic(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const d = new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return { date: d.toISOString().slice(0, 10), hour: Number(get('hour')) };
}

const pad = (h: number) => String(h).padStart(2, '0');
const today = clinic().date;
const nowHour = clinic().hour;
// Today's open slot runs 01:00–23:59; bookings match by hour, so hours 1–22 can book it.
const canBookToday = nowHour >= 1 && nowHour <= 22;
const openHour = Math.max(nowHour, 1);

const createdAccounts: string[] = [];
const petIds: string[] = [];
const scheduleIds: string[] = [];
let serviceId: string;
let futureDate: string;
let ownerA: { id: string; email: string; password: string; pets: string[] };
let ownerB: { id: string; email: string; password: string; pets: string[] };
let ownerUi: { id: string; email: string; password: string; pets: string[] };

async function ownerWithPets(label: string, count: number) {
  const account = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: `E2E ${label}` });
  createdAccounts.push(account.id);
  const client = await userDb(account.email, account.password);
  const pets: string[] = [];
  for (let i = 0; i < count; i++) {
    const { data: pet, error } = await client.rpc('create_owned_pet', { p_name: `OncePerDay ${label} ${i + 1}`, p_species: 'dog' });
    if (error || !pet) throw error;
    pets.push(pet.id);
    petIds.push(pet.id);
  }
  return { ...account, pets };
}

async function addSchedule(date: string, start: string, end: string) {
  const { data, error } = await serviceDb()
    .from('appointment_schedules')
    .insert({
      specific_date: date,
      day_of_week: new Date(`${date}T00:00:00Z`).getUTCDay(),
      start_time: start,
      end_time: end,
      max_capacity: 99,
      is_recurring: false,
      is_closed: false,
      status: 'active',
    })
    .select('id')
    .single();
  if (error || !data) throw error;
  scheduleIds.push(data.id);
}

async function book(owner: { email: string; password: string }, petId: string, date: string, hour: number) {
  const client = await userDb(owner.email, owner.password);
  return client.rpc('book_appointment', {
    p_pet_id: petId,
    p_service_id: serviceId,
    p_preferred_date: date,
    p_preferred_time: `${pad(hour)}:00:00+00`,
  });
}

async function findFreeFutureDate() {
  const db = serviceDb();
  for (let offset = 40; offset < 140; offset++) {
    const date = clinic(offset).date;
    const { count } = await db.from('appointment_schedules').select('id', { count: 'exact', head: true }).eq('specific_date', date);
    if (!count) return date;
  }
  throw new Error('No free future date for the once-per-day test.');
}

test.beforeAll(async () => {
  test.setTimeout(180000);
  const { data: service } = await serviceDb().from('services').select('id').eq('slug', 'general-consultation').single();
  serviceId = service!.id;

  // Today: an early slot that has already ended (00:00–01:00) and an open one (01:00–23:59).
  await addSchedule(today, '00:00:00', '01:00:00');
  await addSchedule(today, '01:00:00', '23:59:00');
  futureDate = await findFreeFutureDate();
  await addSchedule(futureDate, '09:00:00', '17:00:00');

  ownerA = await ownerWithPets('Owner A', 2);
  ownerB = await ownerWithPets('Owner B', 3);
  ownerUi = await ownerWithPets('Owner UI', 1);
});

test.afterAll(async () => {
  test.setTimeout(120000);
  const db = serviceDb();
  const ownerIds = [ownerA, ownerB, ownerUi].filter(Boolean).map((o) => o.id);
  const { data: appts } = await db.from('appointments').select('id').in('owner_id', ownerIds);
  const apptIds = (appts ?? []).map((a) => a.id);
  if (apptIds.length) {
    await db.from('appointment_status_history').delete().in('appointment_id', apptIds);
    await db.from('appointments').delete().in('id', apptIds);
  }
  if (scheduleIds.length) await db.from('appointment_schedules').delete().in('id', scheduleIds);
  if (petIds.length) {
    await db.from('pet_owners').delete().in('pet_id', petIds);
    await db.from('pets').delete().in('id', petIds);
  }
  await deleteAccounts(createdAccounts);
});

test('an owner can book an appointment for today', async () => {
  test.skip(!canBookToday, 'Needs a Manila time between 01:00 and 22:59.');
  const { data, error } = await book(ownerA, ownerA.pets[0], today, openHour);
  expect(error).toBeNull();
  expect(data?.status).toBe('requested');
  expect(data?.preferred_date).toBe(today);
});

test('the same owner cannot book a second appointment that day, even for another pet', async () => {
  test.skip(!canBookToday, 'Needs a Manila time between 01:00 and 22:59.');
  const { error } = await book(ownerA, ownerA.pets[1], today, openHour);
  expect(error?.message).toContain('You already have an appointment on this day. You can book only one appointment per day.');
});

test('a slot that already ended today cannot be booked', async () => {
  test.skip(nowHour < 1, 'The 00:00–01:00 slot has not ended yet.');
  const { error } = await book(ownerB, ownerB.pets[0], today, 0);
  expect(error?.message).toContain('That time slot has already ended today.');
});

test('simultaneous requests from one owner for the same day create exactly one booking', async () => {
  const results = await Promise.all(ownerB.pets.map((petId, i) => book(ownerB, petId, futureDate, 9 + i)));
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  for (const r of results.filter((r) => r.error)) {
    expect(r.error?.message).toContain('You already have an appointment on this day.');
  }
  const { count } = await serviceDb()
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerB.id)
    .eq('preferred_date', futureDate)
    .not('status', 'in', '(cancelled,no_show)');
  expect(count).toBe(1);
});

test('another day is still fine, and cancelling frees the day again', async () => {
  const db = serviceDb();
  // A different day is allowed for an owner who already booked today.
  const otherDay = await book(ownerA, ownerA.pets[1], futureDate, 10);
  expect(otherDay.error).toBeNull();

  // Cancel Owner B's booking on the future date: they can book that day again.
  await db.from('appointments').update({ status: 'cancelled' }).eq('owner_id', ownerB.id).eq('preferred_date', futureDate);
  const again = await book(ownerB, ownerB.pets[0], futureDate, 11);
  expect(again.error).toBeNull();
});

async function openCalendar(page: Page, { signIn = true } = {}) {
  if (signIn) await loginAndOpenDashboard(page, ownerUi.email, ownerUi.password);
  await page.goto('/dashboard/appointments/new');
  await page.getByText('OncePerDay Owner UI 1').first().click();
  await page.getByText('General Consultation').first().click();
  await page.locator('#step-0-next-btn').click();
  return page.locator(`button[data-date="${today}"]`);
}

test('booking form: today is bookable, ended slots are marked, and a booked day is blocked', async ({ page }) => {
  test.skip(!canBookToday, 'Needs a Manila time between 01:00 and 22:59.');
  const todayCell = await openCalendar(page);
  await expect(todayCell).toHaveAttribute('title', /^Available:/, { timeout: 30000 });
  await expect(todayCell).toBeEnabled();
  await todayCell.click();
  await page.locator('#step-1-next-btn').click();

  const ended = page.getByRole('button', { name: /12:00 AM - 1:00 AM/ });
  await expect(ended).toBeDisabled({ timeout: 30000 });
  await expect(ended).toContainText('Ended');

  const open = page.getByRole('button', { name: /1:00 AM - 11:59 PM/ });
  await expect(open).toBeEnabled();
  await open.click();
  await page.locator('#step-2-next-btn').click();
  await page.locator('#appt-reason').fill('Same-day visit');
  await page.locator('#submit-appt-btn').click();
  await expect(page.getByText('Appointment requested!')).toBeVisible({ timeout: 30000 });

  // Back in the form, today is now blocked as the owner's booked day.
  const bookedCell = await openCalendar(page, { signIn: false });
  await expect(bookedCell).toHaveAttribute('title', 'You already have an appointment on this day', { timeout: 30000 });
  await expect(bookedCell).toBeDisabled();
  await expect(bookedCell).toContainText('Booked');
});
