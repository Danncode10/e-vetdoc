import { expect, Page } from '@playwright/test';

export async function runVetClinicalFlow(page: Page) {
  // Use Admin credentials because unassigned appointments are only visible to admins due to RLS
  const loginEmail = process.env.TEST_ADMIN_EMAIL || 'adminTest@gmail.com';
  const loginPassword = process.env.TEST_ADMIN_PASSWORD!;
  
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.locator('#email').fill(loginEmail);
  await page.locator('#password').fill(loginPassword);
  await page.locator('button[type="submit"]').click();

  await expect(page.locator('text=Welcome back!').or(page.locator('text=Login successful!'))).toBeVisible({ timeout: 15000 });

  await page.goto('/dashboard?tab=appointments');
  await expect(page.locator('text=Appointments').first()).toBeVisible({ timeout: 10000 });

  // Encounters start only from booked visits, so open a booked one (from the owner booking flow).
  await page.getByRole('button', { name: /^Booked/ }).click();
  await expect(page.getByRole('button', { name: 'View details' }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'View details' }).first().click();
  
  const startEncounter = page.locator('text=Start Encounter').or(page.locator('text=View / Edit Encounter')).first();
  const finalizedRecord = page.locator('text=View Finalized Record').first();

  await expect(startEncounter.or(finalizedRecord)).toBeVisible({ timeout: 10000 });

  if (await finalizedRecord.isVisible()) {
    console.log('Record is already finalized. Skipping clinical flow.');
    return;
  }

  await startEncounter.click();

  await expect(page.locator('text=Encounter Workspace')).toBeVisible({ timeout: 10000 });
  
  await page.getByPlaceholder("What is the primary reason for today's visit?").fill('Checkup test');
  await page.getByPlaceholder('e.g. Lethargic for 2 days, not eating...').fill('Patient is healthy');
  await page.getByPlaceholder('e.g. Temp 101.5F, HR 120, pale mucous membranes...').fill('Temp normal, HR normal');
  await page.getByPlaceholder('e.g. Suspect acute gastroenteritis vs foreign body...').fill('Healthy adult dog');
  await page.getByPlaceholder('e.g. Run CBC/Chem, administer SQ fluids, send home with Cerenia...').fill('Annual vaccine next month');

  // Add Diagnosis (1st button)
  await page.getByRole('button', { name: 'Add' }).first().click(); 
  await page.getByPlaceholder('Diagnosis description...').first().fill('Healthy pet');
  
  // Add Treatment (2nd button)
  await page.getByRole('button', { name: 'Add' }).nth(1).click();
  await page.getByPlaceholder('Treatment name...').fill('Nail Trim');
  await page.getByPlaceholder('0.00').fill('15.00');

  // Add Prescription (3rd button)
  await page.getByRole('button', { name: 'Add' }).nth(2).click(); 
  await page.getByPlaceholder('e.g. Amoxicillin').fill('Heartworm preventative');
  await page.getByPlaceholder('e.g. Give with food via mouth').fill('1 chewable monthly');
  
  await page.getByRole('button', { name: /Sign & Lock Record/i }).click();
  await page.getByRole('button', { name: 'Sign Record' }).click();
  
  await expect(page.locator('text=Encounter signed successfully!')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('text=Signed').first()).toBeVisible();
}

export async function runAdminAuditVerification(page: Page) {
  // Switch to admin
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Vet Tester|Admin Tester/i }).click();
  
  const signOutBtn = page.getByRole('button', { name: /Sign Out/i }).first();
  await signOutBtn.waitFor({ state: 'visible' });
  await signOutBtn.click();
  
  await expect(page).toHaveURL(/.*login/, { timeout: 15000 });
  await expect(page.locator('text=Welcome back')).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  
  const actualAdminEmail = process.env.TEST_ADMIN_EMAIL || 'adminTest@gmail.com';
  const actualAdminPassword = process.env.TEST_ADMIN_PASSWORD!;
  await page.locator('#email').fill(actualAdminEmail);
  await page.locator('#password').fill(actualAdminPassword);
  await page.locator('button[type="submit"]').click();
  
  await expect(page.locator('text=Welcome back!').or(page.locator('text=Login successful!'))).toBeVisible({ timeout: 15000 });

  await page.goto('/dashboard?tab=logs');
  await expect(page.locator('text=signed').first()).toBeVisible({ timeout: 15000 });
}
