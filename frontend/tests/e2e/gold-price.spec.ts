import { test, expect } from '@playwright/test';

test('user can navigate to gold price recording & record a new gold price', async ({ page }) => {
  await page.goto('/people');
  await expect(page.getByText('Permanent identity records')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByText('Manage tenant-ready')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gold Prices' })).toBeVisible();
  await page.getByRole('link', { name: 'Gold Prices' }).click();
  await expect(page.getByText('Record the tenant gold-price')).toBeVisible();
  await page.getByRole('spinbutton', { name: 'BRL per Gram' }).click();
  await page.getByRole('spinbutton', { name: 'BRL per Gram' }).fill('141.90');
  await page.getByRole('textbox', { name: 'Notes' }).click();
  await page.getByRole('textbox', { name: 'Notes' }).fill('None');
  await page.getByRole('button', { name: 'Record Gold Price' }).click();
  await expect(page.locator('tbody')).toContainText('2026-06-24');
  await page.getByRole('cell', { name: 'R$' }).click();
  await expect(page.locator('tbody')).toContainText('R$ 141,90');
});
