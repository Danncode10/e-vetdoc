import { test, expect } from '@playwright/test';
import {
  accounts,
  createAccount,
  createBookedAppointment,
  deleteAccounts,
  deleteBookedAppointment,
  loginAndOpenDashboard,
  serviceDb,
} from './flows/accounts';

// Stage 7 — cancel options per role (#7): vets have none, the clinic gets clinic
// reasons, owners keep their personal reasons.
test.describe.configure({ mode: 'serial', timeout: 120000 });

const OWNER_REASONS = ['I need to reschedule', 'My pet is unwell / not ready'];
const CLINIC_REASONS = ['Clinic emergency', 'No veterinarian available', 'Bad weather'];

let owner: { id: string; email: string; password: string };
const bookings: Array<{ petId: string; appointmentId: string }> = [];

test.beforeAll(async () => {
  test.setTimeout(120000);
  owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Cancel Owner' });
  bookings.push(await createBookedAppointment(owner.id, '2030-02-11'));
  bookings.push(await createBookedAppointment(owner.id, '2030-02-12'));
});

test.afterAll(async () => {
  test.setTimeout(120000);
  for (const booking of bookings) await deleteBookedAppointment(booking);
  await deleteAccounts([owner.id]);
});

test('a veterinarian sees no cancel action anywhere', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.vet.email, accounts.vet.password);
  await page.goto('/dashboard?tab=appointments');
  await expect(page.getByText('E2E Cancel Owner').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: /cancel appointment/i })).toHaveCount(0);

  await page.goto(`/dashboard/appointments/${bookings[0].appointmentId}`);
  await expect(page.getByText('Back to appointments')).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: /cancel appointment/i })).toHaveCount(0);
});

test('the owner sees personal reasons only', async ({ page }) => {
  await loginAndOpenDashboard(page, owner.email, owner.password);
  await page.goto(`/dashboard/appointments/${bookings[0].appointmentId}`);
  await page.getByRole('button', { name: 'Cancel Appointment' }).click();
  const dialog = page.getByRole('dialog');
  for (const reason of OWNER_REASONS) await expect(dialog.getByText(reason)).toBeVisible();
  for (const reason of CLINIC_REASONS) await expect(dialog.getByText(reason)).toHaveCount(0);
});

test('staff cancels with a clinic reason', async ({ page }) => {
  await loginAndOpenDashboard(page, accounts.staff.email, accounts.staff.password);
  await page.goto(`/dashboard/appointments/${bookings[1].appointmentId}`);
  await page.getByRole('button', { name: 'Cancel Appointment' }).click();
  const dialog = page.getByRole('dialog');
  for (const reason of CLINIC_REASONS) await expect(dialog.getByText(reason)).toBeVisible();
  for (const reason of OWNER_REASONS) await expect(dialog.getByText(reason)).toHaveCount(0);

  await dialog.getByText('No veterinarian available').click();
  await dialog.getByRole('button', { name: /cancel appointment/i }).click();
  await expect(page.getByText('Appointment cancelled successfully')).toBeVisible({ timeout: 30000 });

  const { data } = await serviceDb()
    .from('appointments')
    .select('status, cancellation_reason')
    .eq('id', bookings[1].appointmentId)
    .single();
  expect(data).toEqual({ status: 'cancelled', cancellation_reason: 'no_veterinarian_available' });
});
