import { test, expect } from '@playwright/test';
import {
  accounts,
  createAccount,
  createBookedAppointment,
  deleteAccounts,
  deleteBookedAppointment,
  loginAndOpenDashboard,
  sidebarTab,
} from './flows/accounts';

// Stage 2 — Staff role and the permission matrix in the app (#1, #4).
test.describe.configure({ timeout: 120000 });

const ALL_TABS = ['Overview', 'Pets', 'Owners', 'Appointments', 'Schedule', 'Billing', 'Approvals', 'Team', 'Logs'];

const expectedTabs: Record<keyof typeof accounts, string[]> = {
  admin: ['Overview', 'Pets', 'Owners', 'Appointments', 'Schedule', 'Billing', 'Approvals', 'Team', 'Logs'],
  staff: ['Overview', 'Pets', 'Owners', 'Appointments', 'Schedule', 'Billing', 'Approvals', 'Logs'],
  vet: ['Overview', 'Pets', 'Owners', 'Appointments', 'Schedule', 'Billing'],
  owner: ['Overview', 'Pets', 'Appointments', 'Billing'],
};

for (const role of Object.keys(expectedTabs) as Array<keyof typeof accounts>) {
  test(`${role} sees exactly the allowed sidebar tabs`, async ({ page }) => {
    await loginAndOpenDashboard(page, accounts[role].email, accounts[role].password);
    for (const tab of ALL_TABS) {
      if (expectedTabs[role].includes(tab)) {
        await expect(sidebarTab(page, tab), `${role} should see ${tab}`).toBeVisible();
      } else {
        await expect(sidebarTab(page, tab), `${role} should not see ${tab}`).toHaveCount(0);
      }
    }
  });
}

test('staff cannot open team management', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.staff.email, accounts.staff.password);
  await page.goto('/dashboard/team');
  await page.waitForURL((url) => url.pathname === '/dashboard', { timeout: 20000 });
});

test('admin can see and assign the Staff role in Team', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
  await page.goto('/dashboard/team');
  await expect(page.getByText(accounts.staff.email, { exact: false })).toBeVisible({ timeout: 20000 });
  await expect(page.locator('select option[value="staff"]')).toHaveCount(1);
});

test.describe('appointment management', () => {
  let ownerId: string;
  let booking: { petId: string; appointmentId: string };

  test.beforeAll(async () => {
  test.setTimeout(120000);
    const owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Booking Owner' });
    ownerId = owner.id;
    booking = await createBookedAppointment(ownerId);
  });

  test.afterAll(async () => {
  test.setTimeout(120000);
    await deleteBookedAppointment(booking);
    await deleteAccounts([ownerId]);
  });

  test('a veterinarian has no cancel action on an appointment', async ({ page }) => {
    await loginAndOpenDashboard(page, accounts.vet.email, accounts.vet.password);
    await page.goto(`/dashboard/appointments/${booking.appointmentId}`);
    await expect(page.getByText('Back to appointments')).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('button', { name: 'Cancel Appointment' })).toHaveCount(0);
  });

  test('staff can cancel from the appointment page', async ({ page }) => {
    await loginAndOpenDashboard(page, accounts.staff.email, accounts.staff.password);
    await page.goto(`/dashboard/appointments/${booking.appointmentId}`);
    await expect(page.getByRole('button', { name: 'Cancel Appointment' })).toBeVisible({ timeout: 20000 });
  });
});
