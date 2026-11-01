import { expect, Page } from '@playwright/test';
import { solveSpamCheck } from './captcha';

export async function runAdminScheduleFlow(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'adminTest@gmail.com';
  const adminPassword = process.env.TEST_ADMIN_PASSWORD!;
  
  await page.locator('#email').fill(adminEmail);
  await page.locator('#password').fill(adminPassword);
  await solveSpamCheck(page);
  await page.locator('button[type="submit"]').click();
  
  await expect(page.locator('text=Welcome back!').or(page.locator('text=Login successful!'))).toBeVisible({ timeout: 15000 });
  
  await page.goto('/dashboard/schedules/new');
  // Wait for hydration so the form keeps the values typed below (first compile is slow).
  await page.waitForLoadState('networkidle');
  
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 2);
  const yyyy = futureDate.getFullYear();
  const mm = String(futureDate.getMonth() + 1).padStart(2, '0');
  const dd = String(futureDate.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;
  
  await page.locator('#sched-date').fill(dateStr);
  await page.locator('#sched-start').fill('09:00');
  await page.locator('#sched-end').fill('17:00');
  await page.locator('#sched-capacity').fill('99');
  await page.locator('#status-open-btn').click();
  await page.locator('#submit-schedule-btn').click();
  
  await expect(page.getByText('Schedule created successfully').or(page.getByText('Schedule updated successfully')).or(page.getByText('Add Schedule'))).toBeVisible({ timeout: 10000 });
  
  await page.context().clearCookies();
}

export async function runOwnerBookingFlow(page: Page) {
  const ownerEmail = process.env.TEST_OWNER_EMAIL || 'ownerTest@gmail.com';
  const ownerPassword = process.env.TEST_OWNER_PASSWORD!;
  
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(ownerEmail);
  await page.locator('#password').fill(ownerPassword);
  await solveSpamCheck(page);
  await page.locator('button[type="submit"]').click();
  
  await expect(page.locator('text=Welcome back!').or(page.locator('text=Login successful!'))).toBeVisible({ timeout: 15000 });
  
  if (await page.getByText('Complete your profile').isVisible({ timeout: 5000 }).catch(() => false)) {
    await page.getByPlaceholder('Jane Doe').fill('Test Owner');
    await page.getByPlaceholder('+1 555 123 4567').fill('555-555-5555');
    await page.getByPlaceholder('123 Clinic St, City').fill('123 Test St');
    await page.getByRole('button', { name: 'Continue to dashboard' }).click();
    await expect(page.getByText('Welcome to E-VetDoc')).toBeVisible({ timeout: 10000 });
  }

  await page.goto('/dashboard/pets/new');
  await page.waitForTimeout(2000); 
  
  const petName = `TestDog-${Date.now()}`;
  await page.getByPlaceholder('e.g. Milo, Bella, Luna').fill(petName);
  await page.locator('select').first().selectOption('dog');
  await page.getByPlaceholder('e.g. Golden Retriever, Puspin, Mixed').fill('Golden Retriever');
  await page.getByText('Save pet', { exact: true }).click();
  
  await page.waitForURL('**/dashboard?tab=pets', { timeout: 10000 });

  await page.goto('/dashboard/appointments/new');
  
  await page.getByText(petName).first().click();
  await page.getByText('Select a Service').isVisible();
  await page.locator('text=min').first().click();
  await page.locator('#step-0-next-btn').click();
  
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 2);

  // The target date can fall in next month (e.g. near the end of a month).
  if (futureDate.getMonth() !== new Date().getMonth()) {
    await page.getByRole('button', { name: 'Next month' }).click();
  }
  await page.waitForSelector('button[title*="Available:"]', { timeout: 10000 });
  await page
    .locator('button[title*="Available:"]')
    .filter({ has: page.locator('span', { hasText: new RegExp(`^${futureDate.getDate()}$`) }) })
    .first()
    .click();
  await page.locator('#step-1-next-btn').click();
  
  await page.locator('button:not([disabled])').filter({ hasText: '9:00 AM' }).first().click();
  await page.locator('#step-2-next-btn').click();
  
  await page.locator('#appt-reason').fill('Checkup test');
  await page.locator('#submit-appt-btn').click();
  
  await expect(page.locator('text=Appointment requested!')).toBeVisible({ timeout: 15000 });
}
