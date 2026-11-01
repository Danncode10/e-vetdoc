import { test, expect } from '@playwright/test';
import { solveSpamCheck } from './flows/captcha';

test.describe('System Check - Login', () => {
  test('should login successfully with owner test account', async ({ page }) => {
    // Navigate to the login page
    await page.goto('/login');
    
    // Check if the login form is visible
    await expect(page.locator('h2')).toContainText('Welcome back');
    
    // Fill credentials
    const email = process.env.TEST_OWNER_EMAIL;
    const password = process.env.TEST_OWNER_PASSWORD;
    
    if (!email || !password) {
      test.skip(true, 'Test accounts not provided in environment variables');
      return;
    }

    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await solveSpamCheck(page);
    
    // Submit form
    await page.locator('button[type="submit"]').click();
    
    // Verify successful login
    // The user will be redirected to dashboard on success, or show a success message
    // "Opening your clinic workspace…" or a Toast
    await expect(page.locator('text=Welcome back!').or(page.locator('text=Login successful!'))).toBeVisible({ timeout: 10000 });
  });
});
