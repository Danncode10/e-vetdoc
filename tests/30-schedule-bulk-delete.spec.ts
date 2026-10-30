import { test, expect } from '@playwright/test';
import { accounts, loginAndOpenDashboard, serviceDb, sidebarTab } from './flows/accounts';

// Schedule: delete several schedules at once (Admin and Staff). Team: "Staff" label.
test.describe.configure({ mode: 'serial', timeout: 180000 });

let monthsAhead = 0;
let dates: string[] = [];

test.beforeAll(async () => {
  const db = serviceDb();
  // A month 10–30 months ahead with no schedules yet.
  for (let ahead = 10; ahead < 30 && !dates.length; ahead++) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() + ahead);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const { count } = await db.from('appointment_schedules').select('id', { count: 'exact', head: true })
      .gte('specific_date', `${prefix}-01`).lte('specific_date', `${prefix}-28`);
    if (!count) {
      monthsAhead = ahead;
      dates = ['05', '06', '07'].map((day) => `${prefix}-${day}`);
    }
  }
  await db.from('appointment_schedules').insert(dates.map((date) => ({
    specific_date: date, day_of_week: new Date(`${date}T00:00:00Z`).getUTCDay(), start_time: '09:00:00', end_time: '12:00:00',
    max_capacity: 3, is_recurring: false, is_closed: false, status: 'active' as const,
  })));
});

test.afterAll(async () => {
  const db = serviceDb();
  const { data } = await db.from('appointment_schedules').select('id').in('specific_date', dates);
  const ids = (data ?? []).map((s) => s.id);
  if (ids.length) {
    await db.from('schedule_audit_logs').delete().in('target_schedule_id', ids);
    await db.from('appointment_schedules').delete().in('id', ids);
  }
});

test('staff deletes two of three schedules in one go', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.staff.email, accounts.staff.password);
  await sidebarTab(page, 'Schedule').click();
  await expect(page.locator('#bulk-delete-btn')).toBeVisible({ timeout: 30000 });
  for (let i = 0; i < monthsAhead; i++) await page.locator('#next-month-btn').click();

  await page.locator('#bulk-delete-btn').click();
  await page.getByTestId(`bulk-select-${dates[0]}`).check();
  await page.getByTestId(`bulk-select-${dates[2]}`).check();
  await expect(page.getByTestId('bulk-delete-confirm')).toHaveText(/Delete 2 schedules/);
  await page.getByTestId('bulk-delete-confirm').click();
  await expect(page.getByRole('button', { name: 'Delete schedules' })).toBeDisabled();
  await page.getByTestId('confirm-typed-input').fill('DELETE');
  await page.getByRole('button', { name: 'Delete schedules' }).click();
  await expect(page.getByText('Deleted 2 schedules')).toBeVisible({ timeout: 30000 });

  const { data } = await serviceDb().from('appointment_schedules').select('specific_date').in('specific_date', dates);
  expect((data ?? []).map((s) => s.specific_date)).toEqual([dates[1]]);
});

test('vets do not get the Delete multiple option', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.vet.email, accounts.vet.password);
  await sidebarTab(page, 'Schedule').click();
  await expect(page.getByTestId('schedule-read-only')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#bulk-delete-btn')).toHaveCount(0);
});

test('Team summary says "Staff" instead of "Active Staff"', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
  await page.goto('/dashboard/team');
  await expect(page.getByText('Staff', { exact: true }).first()).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Active Staff')).toHaveCount(0);
});
