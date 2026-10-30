import { test, expect } from '@playwright/test';

// Landing page: About us and Contact us tabs.
test('navbar links open About us and Contact us with the clinic and developers', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'About us' }).first().click();
  await expect(page).toHaveURL(/#about$/);
  await expect(page.getByRole('heading', { name: 'Built for Bangan Hill Veterinary Clinic' })).toBeInViewport();
  const devs = page.getByTestId('developer-list');
  for (const name of ['Chino Camilo T. Guiyab', 'Vinz Auscar Baliton', 'Romulo M. Umali', 'Vinverth Vince Rashid M. Ramos', 'Giezel Ann S. Sagadra']) {
    await expect(devs).toContainText(name);
  }
  if (process.env.SHOT_DIR) await page.locator('#about').screenshot({ path: `${process.env.SHOT_DIR}/about.png` });

  await page.getByRole('navigation').getByRole('link', { name: 'Contact us' }).first().click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.getByTestId('clinic-address')).toContainText('Cornwall Building, Stall 7 and 8');
  await expect(page.getByTestId('clinic-address')).toContainText('Bayombong, Nueva Vizcaya');
  await expect(page.getByRole('link', { name: 'Get directions' })).toHaveAttribute('href', 'https://maps.app.goo.gl/UFRNE9BkJHRsNp3w7');
  if (process.env.SHOT_DIR) await page.locator('#contact').screenshot({ path: `${process.env.SHOT_DIR}/contact.png` });
});

test('phone: sections fit without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/#about');
  await expect(page.getByTestId('developer-list')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  if (process.env.SHOT_DIR) await page.locator('#about').screenshot({ path: `${process.env.SHOT_DIR}/about-mobile.png` });
});
