import { test, expect, type Page } from '@playwright/test';
import { createAccount, deleteAccounts, loginAndOpenDashboard, serviceDb, userDb } from './flows/accounts';

// Owners can book Deworming, Grooming and Others; Others needs a reason.
test.describe.configure({ mode: 'serial', timeout: 180000 });
test.use({ timezoneId: 'Asia/Manila' });

let owner: { id: string; email: string; password: string };
const petIds: string[] = [];
let scheduleId: string;
let bookingDate: string;

function clinicDate(offset: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

test.beforeAll(async () => {
  const db = serviceDb();
  for (let offset = 3; offset < 60 && !bookingDate; offset++) {
    const date = clinicDate(offset);
    const { count } = await db.from('appointment_schedules').select('id', { count: 'exact', head: true }).eq('specific_date', date);
    if (!count) bookingDate = date;
  }
  const { data: schedule, error } = await db.from('appointment_schedules').insert({
    specific_date: bookingDate, day_of_week: new Date(`${bookingDate}T00:00:00Z`).getUTCDay(),
    start_time: '09:00:00', end_time: '12:00:00', max_capacity: 5, is_recurring: false, is_closed: false, status: 'active',
  }).select('id').single();
  if (error) throw error;
  scheduleId = schedule!.id;

  owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Services Owner' });
  const client = await userDb(owner.email, owner.password);
  for (const name of ['Services Dog', 'Services Cat']) {
    const { data: pet } = await client.rpc('create_owned_pet', { p_name: name, p_species: 'dog' });
    petIds.push(pet!.id);
  }
});

test.afterAll(async () => {
  const db = serviceDb();
  const { data } = await db.from('appointments').select('id').eq('owner_id', owner.id);
  const ids = (data ?? []).map((a) => a.id);
  if (ids.length) {
    await db.from('appointment_status_history').delete().in('appointment_id', ids);
    await db.from('appointments').delete().in('id', ids);
  }
  await db.from('appointment_schedules').delete().eq('id', scheduleId);
  await db.from('pet_owners').delete().in('pet_id', petIds);
  await db.from('pets').delete().in('id', petIds);
  await deleteAccounts([owner.id]);
});

async function bookThroughForm(page: Page, petName: string, serviceSlug: string, reason: string) {
  await page.goto('/dashboard/appointments/new');
  await page.getByText(petName).first().click();
  await page.getByTestId(`service-${serviceSlug}`).click();
  await page.locator('#step-0-next-btn').click();
  const [year, month] = bookingDate.split('-').map(Number);
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  for (let i = 0; i < 3; i++) {
    if (await page.getByText(`${monthLabel} ${year}`, { exact: true }).isVisible()) break;
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await page.locator(`button[data-date="${bookingDate}"]`).click();
  await page.locator('#step-1-next-btn').click();
  await page.getByRole('button', { name: /9:00 AM - 12:00 PM/ }).click();
  await page.locator('#step-2-next-btn').click();
  await page.locator('#appt-reason').fill(reason);
  await page.locator('#submit-appt-btn').click();
}

test('the booking form lists Deworming, Grooming and Others', async ({ page }) => {
  await loginAndOpenDashboard(page, owner.email, owner.password);
  await page.goto('/dashboard/appointments/new');
  for (const [slug, name] of [['deworming', 'Deworming'], ['grooming', 'Grooming'], ['others', 'Others']]) {
    await expect(page.getByTestId(`service-${slug}`)).toContainText(name, { timeout: 30000 });
  }
});

test('Others requires a reason; with one it books', async ({ page }) => {
  await loginAndOpenDashboard(page, owner.email, owner.password);
  await bookThroughForm(page, 'Services Dog', 'others', '');
  await expect(page.getByText('Please describe what your pet needs in Reason for visit.').first()).toBeVisible();

  await page.locator('#appt-reason').fill('Skin rash check');
  await page.locator('#submit-appt-btn').click();
  await expect(page.getByText('Appointment requested!')).toBeVisible({ timeout: 30000 });
});

test('Grooming books like any other service', async ({ page }) => {
  await loginAndOpenDashboard(page, owner.email, owner.password);
  await bookThroughForm(page, 'Services Cat', 'grooming', 'Bath and nail trim');
  await expect(page.getByText('Appointment requested!')).toBeVisible({ timeout: 30000 });

  const { data } = await serviceDb()
    .from('appointments')
    .select('reason, services(slug)')
    .eq('owner_id', owner.id)
    .order('created_at');
  expect(data!.map((a) => (a.services as { slug: string } | null)?.slug)).toEqual(['others', 'grooming']);
  expect(data![0].reason).toBe('Skin rash check');
});
