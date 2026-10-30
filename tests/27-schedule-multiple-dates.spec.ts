import { test, expect, type Page } from '@playwright/test';
import { accounts, loginAndOpenDashboard, serviceDb } from './flows/accounts';

// Add Schedule: many dates at once (multiple dates or a date range with weekdays).
test.describe.configure({ mode: 'serial', timeout: 180000 });

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

let monday: string; // a Monday in a free week
const touched: string[] = [];

test.beforeAll(async () => {
  const db = serviceDb();
  // First Monday ~2 years out whose Mon–Sun week has no schedules.
  let d = new Date();
  d.setUTCDate(d.getUTCDate() + 700);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  for (let i = 0; i < 30; i++) {
    const mon = d.toISOString().slice(0, 10);
    const { count } = await db
      .from('appointment_schedules')
      .select('id', { count: 'exact', head: true })
      .gte('specific_date', mon)
      .lte('specific_date', addDays(mon, 13));
    if (!count) { monday = mon; break; }
    d.setUTCDate(d.getUTCDate() + 14);
  }
  // Wednesday already has a 10:00–12:00 schedule: the range must skip it.
  await db.from('appointment_schedules').insert({
    specific_date: addDays(monday, 2), day_of_week: 3, start_time: '10:00:00', end_time: '12:00:00',
    max_capacity: 3, is_recurring: false, is_closed: false, status: 'active',
  });
  touched.push(...Array.from({ length: 14 }, (_, i) => addDays(monday, i)));
});

test.afterAll(async () => {
  const db = serviceDb();
  const { data } = await db.from('appointment_schedules').select('id').in('specific_date', touched);
  const ids = (data ?? []).map((s) => s.id);
  if (ids.length) {
    await db.from('schedule_audit_logs').delete().in('target_schedule_id', ids);
    await db.from('appointment_schedules').delete().in('id', ids);
  }
});

async function openForm(page: Page, who: 'admin' | 'staff') {
  await loginAndOpenDashboard(page, accounts[who].email, accounts[who].password);
  await page.goto('/dashboard/schedules/new');
  await page.waitForLoadState('networkidle');
  await page.locator('#sched-start').fill('09:00');
  await page.locator('#sched-end').fill('17:00');
  await page.locator('#sched-capacity').fill('3');
}

test('admin: a date range Mon–Sat creates one schedule per day and skips the one already scheduled', async ({ page }) => {
  await openForm(page, 'admin');
  await page.getByTestId('date-mode-range').click();
  await page.locator('#sched-range-from').fill(monday);
  await page.locator('#sched-range-to').fill(addDays(monday, 6)); // through Sunday
  // Sunday is off by default (Mon–Sat).
  await expect(page.getByTestId('weekday-Sun')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('bulk-preview')).toContainText('6 dates will get this schedule');

  await page.locator('#submit-schedule-btn').click();
  await expect(page.getByText('Created 5 schedules')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Skipped 1: .*already has a schedule at these times/)).toBeVisible();

  const { data } = await serviceDb()
    .from('appointment_schedules')
    .select('specific_date, start_time, max_capacity')
    .gte('specific_date', monday)
    .lte('specific_date', addDays(monday, 6))
    .eq('start_time', '09:00:00');
  expect((data ?? []).map((r) => r.specific_date).sort()).toEqual(
    [0, 1, 3, 4, 5].map((i) => addDays(monday, i)),
  );
  expect(data!.every((r) => r.max_capacity === 3)).toBe(true);
});

test('staff: multiple hand-picked dates', async ({ page }) => {
  await openForm(page, 'staff');
  await page.getByTestId('date-mode-multiple').click();
  for (const date of [addDays(monday, 8), addDays(monday, 10), addDays(monday, 8)]) {
    await page.locator('#sched-multi-date').fill(date);
    await page.getByTestId('add-date').click();
  }
  // The duplicate is ignored.
  await expect(page.getByTestId('bulk-preview')).toContainText('2 dates will get this schedule');
  await page.getByRole('button', { name: `Remove ${addDays(monday, 10)}` }).click();
  await page.locator('#sched-multi-date').fill(addDays(monday, 11));
  await page.getByTestId('add-date').click();

  await page.locator('#submit-schedule-btn').click();
  await expect(page.getByText('Created 2 schedules')).toBeVisible({ timeout: 30000 });

  const { data } = await serviceDb()
    .from('appointment_schedules')
    .select('specific_date')
    .in('specific_date', [addDays(monday, 8), addDays(monday, 10), addDays(monday, 11)]);
  expect((data ?? []).map((r) => r.specific_date).sort()).toEqual([addDays(monday, 8), addDays(monday, 11)]);
});

test('single date still works as before', async ({ page }) => {
  await openForm(page, 'admin');
  await page.locator('#sched-date').fill(addDays(monday, 12));
  await page.locator('#submit-schedule-btn').click();
  await expect(page.getByText('Schedule created successfully')).toBeVisible({ timeout: 30000 });
});
