import { test, expect } from '@playwright/test';
import { accounts, loginAndOpenDashboard, serviceDb } from './flows/accounts';

// Live-site bug: an end time before the start time showed "An error occurred in the Server
// Components render" (production hides thrown server messages). Now the form explains it.
// Run against a production build with E2E_BASE_URL=http://localhost:3100 to reproduce Vercel.
test.describe.configure({ timeout: 180000 });
if (process.env.E2E_BASE_URL) test.use({ baseURL: process.env.E2E_BASE_URL });

test('end time before start time shows a clear message and saves nothing', async ({ page }) => {
  const date = '2031-10-31';
  await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
  await page.goto('/dashboard/schedules/new');
  await page.waitForLoadState('networkidle');

  await page.locator('#sched-date').fill(date);
  await page.locator('#sched-start').fill('19:08');
  await page.locator('#sched-end').fill('17:00');
  await page.locator('#sched-capacity').fill('10');

  await expect(page.getByTestId('schedule-time-error')).toHaveText('The end time must be later than the start time.');
  await page.locator('#submit-schedule-btn').click();
  await expect(page.getByText('The end time must be later than the start time.').last()).toBeVisible();
  await expect(page.getByText(/Server Components render/)).toHaveCount(0);

  const { count } = await serviceDb()
    .from('appointment_schedules')
    .select('id', { count: 'exact', head: true })
    .eq('specific_date', date);
  expect(count).toBe(0);
});
