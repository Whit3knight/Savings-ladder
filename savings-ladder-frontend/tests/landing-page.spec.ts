import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the correct title and hero text', async ({ page }) => {
    await expect(page).toHaveTitle(/SavingsLadder/);
    const heroHeading = page.locator('h1');
    await expect(heroHeading).toContainText('Save Together');
  });

  test('should have a functional "Connect Wallet" button', async ({ page }) => {
    const connectBtn = page.locator('#connect-wallet-btn');
    await expect(connectBtn).toBeVisible();
    await expect(connectBtn).toContainText('Connect Wallet');
  });
});
