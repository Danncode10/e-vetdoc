import { test, expect } from '@playwright/test';
import {
  accounts,
  createAccount,
  createBookedAppointment,
  deleteAccounts,
  deleteBookedAppointment,
  loginAndOpenDashboard,
  serviceDb,
  sidebarTab,
} from './flows/accounts';

// Oct 30 fixes: "Pet Owners" label, auto-cancel of overdue bookings, Team Online/Offline filter.
test.describe.configure({ mode: 'serial', timeout: 180000 });

/** A clinic-local (Asia/Manila) date `offsetDays` from today, as YYYY-MM-DD. */
function clinicDate(offsetDays: number) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const createdAccounts: string[] = [];
let owner: { id: string; email: string; password: string };
let overdue: { petId: string; appointmentId: string };
let overdueStarted: { petId: string; appointmentId: string };
let upcoming: { petId: string; appointmentId: string };
let startedEncounterId: string;
let teamOnline: { id: string; email: string };
let teamOffline: { id: string; email: string };
let teamDeactivated: { id: string; email: string };

test.beforeAll(async () => {
  test.setTimeout(180000);
  const db = serviceDb();

  owner = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E AutoCancel Owner' });
  createdAccounts.push(owner.id);
  overdue = await createBookedAppointment(owner.id, clinicDate(-2));
  overdueStarted = await createBookedAppointment(owner.id, clinicDate(-2));
  upcoming = await createBookedAppointment(owner.id, clinicDate(7));

  // The clinic already acted on this one (an encounter exists), so it must never auto-cancel.
  const { data: vet } = await db.from('profiles').select('id').eq('email', accounts.vet.email.toLowerCase()).single();
  const { data: encounter, error } = await db
    .from('encounters')
    .insert({ appointment_id: overdueStarted.appointmentId, pet_id: overdueStarted.petId, veterinarian_id: vet!.id, status: 'draft' })
    .select('id')
    .single();
  if (error) throw error;
  startedEncounterId = encounter!.id;

  const online = await createAccount({ requestedRole: 'staff', approveAs: 'staff', fullName: 'E2E Team Online' });
  const offline = await createAccount({ requestedRole: 'staff', approveAs: 'staff', fullName: 'E2E Team Offline' });
  const deactivated = await createAccount({ requestedRole: 'staff', approveAs: 'staff', fullName: 'E2E Team Deactivated' });
  teamOnline = online;
  teamOffline = offline;
  teamDeactivated = deactivated;
  createdAccounts.push(online.id, offline.id, deactivated.id);
  await db.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', online.id);
  await db.from('profiles').update({ last_seen_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq('id', offline.id);
  await db.from('profiles').update({ last_seen_at: new Date().toISOString(), is_active: false }).eq('id', deactivated.id);
});

test.afterAll(async () => {
  test.setTimeout(120000);
  const db = serviceDb();
  await db.from('encounters').delete().eq('id', startedEncounterId);
  for (const appt of [overdue, overdueStarted, upcoming]) {
    if (appt) await deleteBookedAppointment(appt);
  }
  await deleteAccounts(createdAccounts);
});

test.describe('Fix #1 — "Pet Owners" label', () => {
  test('staff pet record lists "Pet Owners", not "Authorized Owners"', async ({ page }) => {
    await loginAndOpenDashboard(page, accounts.staff.email, accounts.staff.password);
    await page.goto(`/user/${owner.id}/pet/${upcoming.petId}`);
    await expect(page.getByRole('heading', { name: 'Pet Owners' })).toBeVisible({ timeout: 60000 });
    await expect(page.getByText(/Authorized Owners/i)).toHaveCount(0);
  });
});

test.describe('Fix #2 — overdue bookings cancel automatically', () => {
  test('opening the dashboard cancels only overdue, untouched bookings', async ({ page }) => {
    await loginAndOpenDashboard(page, owner.email, owner.password);

    const db = serviceDb();
    await expect
      .poll(async () => (await db.from('appointments').select('status').eq('id', overdue.appointmentId).single()).data?.status, { timeout: 30000 })
      .toBe('cancelled');

    const { data: rows } = await db
      .from('appointments')
      .select('id, status, auto_cancelled, cancelled_at')
      .in('id', [overdue.appointmentId, overdueStarted.appointmentId, upcoming.appointmentId]);
    const byId = Object.fromEntries((rows ?? []).map((r) => [r.id, r]));

    expect(byId[overdue.appointmentId]).toMatchObject({ status: 'cancelled', auto_cancelled: true });
    expect(byId[overdue.appointmentId].cancelled_at).not.toBeNull();
    // An encounter was started → the clinic acted on it, so it stays booked.
    expect(byId[overdueStarted.appointmentId]).toMatchObject({ status: 'booked', auto_cancelled: false });
    // Not overdue yet.
    expect(byId[upcoming.appointmentId]).toMatchObject({ status: 'booked', auto_cancelled: false });

    // The status history credits the system, not the person whose page load ran the sweep.
    const { data: history } = await db
      .from('appointment_status_history')
      .select('new_status, changed_by_id, reason, notes')
      .eq('appointment_id', overdue.appointmentId)
      .eq('new_status', 'cancelled')
      .single();
    expect(history).toMatchObject({ changed_by_id: null, reason: 'auto_cancelled' });
    expect(history?.notes).toContain('Cancelled automatically by the system');
  });

  test('owner sees the auto-cancelled indicator on the card and the detail page', async ({ page }) => {
    await loginAndOpenDashboard(page, owner.email, owner.password);
    await sidebarTab(page, 'Appointments').click();

    const cancelledCard = page.getByTestId(`appointment-card-${overdue.appointmentId}`);
    await expect(cancelledCard).toBeVisible({ timeout: 30000 });
    await expect(cancelledCard).toContainText('Cancelled');
    await expect(cancelledCard.getByTestId('auto-cancelled-badge')).toHaveText('Auto-cancelled');
    await expect(cancelledCard.getByTestId('auto-cancelled-notice')).toContainText('Cancelled automatically by the system');
    // Cancelled bookings no longer offer the cancel button.
    await expect(cancelledCard.getByRole('button', { name: 'Cancel appointment' })).toHaveCount(0);

    const upcomingCard = page.getByTestId(`appointment-card-${upcoming.appointmentId}`);
    await expect(upcomingCard).toBeVisible();
    await expect(upcomingCard.getByTestId('auto-cancelled-badge')).toHaveCount(0);

    await page.goto(`/dashboard/appointments/${overdue.appointmentId}`);
    await expect(page.getByTestId('auto-cancelled-notice').first()).toBeVisible({ timeout: 60000 });
    await expect(page.getByTestId('auto-cancelled-badge').first()).toBeVisible();
  });

  test('admin Logs show the system as the actor', async ({ page }) => {
    await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
    await sidebarTab(page, 'Logs').click();
    await expect(page.getByText(/System automatically cancelled/).first()).toBeVisible({ timeout: 60000 });
  });

  test('nobody but the sweep can set the auto-cancelled flag', async () => {
    const db = serviceDb();
    await db.from('appointments').update({ auto_cancelled: true }).eq('id', upcoming.appointmentId);
    const { data } = await db.from('appointments').select('auto_cancelled').eq('id', upcoming.appointmentId).single();
    expect(data?.auto_cancelled).toBe(false);
  });
});

test.describe('Fix #3 — Team tab Online / Offline', () => {
  test('badges show Online/Offline instead of Active, and the filter splits them', async ({ page }) => {
    await loginAndOpenDashboard(page, accounts.admin.email, accounts.admin.password);
    await page.goto('/dashboard/team');
    await expect(page.getByRole('heading', { name: 'Team Management' })).toBeVisible({ timeout: 60000 });

    const card = (email: string) => page.getByTestId(`staff-card-${email}`);
    await expect(card(teamOnline.email)).toBeVisible({ timeout: 30000 });
    await expect(card(teamOnline.email).getByTestId('staff-presence')).toHaveText('Online');
    await expect(card(teamOffline.email).getByTestId('staff-presence')).toHaveText('Offline');
    await expect(card(teamOffline.email).getByTestId('staff-last-seen')).toHaveText('Last seen 2d ago');
    await expect(card(teamDeactivated.email).getByTestId('staff-presence')).toHaveText('Deactivated');
    // The old "Active" pill is gone.
    await expect(page.getByTestId('staff-presence').filter({ hasText: /^Active$/ })).toHaveCount(0);

    await page.getByTestId('staff-filter-online').click();
    await expect(page.getByTestId('staff-filter-online')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(teamOnline.email)).toBeVisible();
    await expect(card(teamOffline.email)).toHaveCount(0);
    // A deactivated account cannot open the dashboard, so it never counts as online.
    await expect(card(teamDeactivated.email)).toHaveCount(0);

    await page.getByTestId('staff-filter-offline').click();
    await expect(card(teamOffline.email)).toBeVisible();
    await expect(card(teamDeactivated.email)).toBeVisible();
    await expect(card(teamOnline.email)).toHaveCount(0);

    const count = async (id: string) => Number((await page.getByTestId(`staff-filter-${id}`).innerText()).match(/(\d+)\s*$/)![1]);
    expect((await count('online')) + (await count('offline'))).toBe(await count('all'));

    await page.getByTestId('staff-filter-all').click();
    await expect(card(teamOnline.email)).toBeVisible();
    await expect(card(teamOffline.email)).toBeVisible();
  });
});
