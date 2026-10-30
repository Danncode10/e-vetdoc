import { test, expect, type Page } from '@playwright/test';
import { accounts, createAccount, deleteAccounts, loginAndOpenDashboard, serviceDb, sidebarTab } from './flows/accounts';

// Bug fix #1 — the Owners tab lists every owner, with an Online / Offline filter.
test.describe.configure({ mode: 'serial', timeout: 120000 });

const created: string[] = [];
let online: { id: string; email: string; password: string };
let offline: { id: string; email: string; password: string };
let pending: { id: string; email: string; password: string };

test.beforeAll(async () => {
  test.setTimeout(120000);
  online = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Presence Online' });
  offline = await createAccount({ requestedRole: 'owner', approveAs: 'owner', fullName: 'E2E Presence Offline' });
  pending = await createAccount({ requestedRole: 'owner', fullName: 'E2E Presence Pending' });
  created.push(online.id, offline.id, pending.id);

  const db = serviceDb();
  await db.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', online.id);
  // Seen two days ago: offline, but not "never signed in".
  await db.from('profiles').update({ last_seen_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq('id', offline.id);
});

test.afterAll(async () => {
  test.setTimeout(120000);
  await deleteAccounts(created);
});

async function openOwners(page: Page, email: string, password: string) {
  await loginAndOpenDashboard(page, email, password);
  await sidebarTab(page, 'Owners').click();
  await expect(page.getByRole('heading', { name: 'Owner Directory' })).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('owner-filter-all')).toBeVisible();
}

function card(page: Page, email: string) {
  return page.getByTestId(`owner-card-${email}`);
}

async function search(page: Page, text: string) {
  await page.getByPlaceholder(/Search by owner name/).fill(text);
}

for (const role of ['staff', 'admin'] as const) {
  test(`${role}: All shows online and offline owners, filters split them`, async ({ page }) => {
    await openOwners(page, accounts[role].email, accounts[role].password);

    // Narrow to this test's accounts so pagination never hides them.
    await search(page, 'E2E Presence');
    await expect(card(page, online.email)).toBeVisible({ timeout: 30000 });
    await expect(card(page, offline.email)).toBeVisible();
    await expect(card(page, pending.email)).toBeVisible();
    await expect(card(page, pending.email)).toContainText('Pending approval');

    await expect(card(page, online.email).getByTestId('owner-presence')).toHaveText('Online');
    await expect(card(page, offline.email).getByTestId('owner-presence')).toHaveText('Last seen 2d ago');
    await expect(card(page, pending.email).getByTestId('owner-presence')).toHaveText('Offline');

    await page.getByTestId('owner-filter-online').click();
    await expect(page.getByTestId('owner-filter-online')).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, online.email)).toBeVisible();
    await expect(card(page, offline.email)).toHaveCount(0);
    await expect(card(page, pending.email)).toHaveCount(0);

    await page.getByTestId('owner-filter-offline').click();
    await expect(card(page, offline.email)).toBeVisible();
    await expect(card(page, pending.email)).toBeVisible();
    await expect(card(page, online.email)).toHaveCount(0);

    // The filter counts add up to the full directory.
    const count = async (id: string) => Number((await page.getByTestId(`owner-filter-${id}`).innerText()).match(/(\d+)\s*$/)![1]);
    expect((await count('online')) + (await count('offline'))).toBe(await count('all'));
  });
}

test('the directory lists every owner account in the database', async ({ page }) => {
  const { count } = await serviceDb()
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'owner')
    .neq('approval_status', 'rejected')
    .is('deleted_at', null);
  await openOwners(page, accounts.staff.email, accounts.staff.password);
  await expect(page.getByTestId('owner-filter-all')).toContainText(String(count));
});

test('opening the dashboard marks a user online (heartbeat)', async ({ page }) => {
  await serviceDb().from('profiles').update({ last_seen_at: null }).eq('id', offline.id);
  await loginAndOpenDashboard(page, offline.email, offline.password);
  await expect
    .poll(async () => {
      const { data } = await serviceDb().from('profiles').select('last_seen_at').eq('id', offline.id).single();
      return data?.last_seen_at ? Date.now() - new Date(data.last_seen_at).getTime() : null;
    }, { timeout: 30000 })
    .toBeLessThan(60_000);
});
