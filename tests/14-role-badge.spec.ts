import { test, expect } from '@playwright/test';
import { accounts, loginAndOpenDashboard } from './flows/accounts';

// Stage 5 — the signed-in user's role is always visible (#5).
test.describe.configure({ timeout: 120000 });

const labels: Record<keyof typeof accounts, string> = {
  admin: 'Admin',
  staff: 'Staff',
  vet: 'Veterinarian',
  owner: 'Owner',
};

for (const role of Object.keys(labels) as Array<keyof typeof accounts>) {
  test(`${role}: role badge shows in the sidebar on every tab`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAndOpenDashboard(page, accounts[role].email, accounts[role].password);
    const badge = page.getByTestId('sidebar-role-badge');
    await expect(badge).toHaveText(labels[role]);
    await page.locator('aside nav').getByRole('button', { name: 'Appointments', exact: true }).click();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(labels[role]);
  });

  test(`${role}: role badge shows in the top bar on a phone`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAndOpenDashboard(page, accounts[role].email, accounts[role].password).catch(async () => {
      // On phones the sidebar starts closed, so just wait for the dashboard URL.
      await page.waitForURL('**/dashboard**', { timeout: 60000 });
    });
    await expect(page.getByTestId('header-role-badge')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('header-role-badge')).toHaveText(labels[role]);
    // The login toast briefly sits past the edge; measure the page once it has closed.
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 15000 });
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
}
