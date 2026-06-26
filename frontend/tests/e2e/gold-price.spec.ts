import { expect, test } from "@playwright/test";
import { seedBrowserAuthz } from "./support/authz";
import { generateUniqueString } from "./support/utils";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test('user can navigate to gold price recording & record a new gold price', async ({ page }) => {
 // Navigate to home page
  await page.goto('/people');
  await expect(page.getByText('Permanent identity records')).toBeVisible();

  // Navigate to Admin
  await expect(page.getByRole('link', { name: 'Admin' })).toBeVisible();
  await page.getByRole('link', { name: 'Admin' }).click();
  await expect(page.getByText('Manage tenant-ready')).toBeVisible();

  // Navigate to Gold Prices
  await expect(page.getByRole('link', { name: 'Gold Prices' })).toBeVisible();
  await page.getByRole('link', { name: 'Gold Prices' }).click();
  await expect(page.getByText('Record the tenant gold-price')).toBeVisible();

  // Get the date
  await expect(page.getByRole('textbox', { name: 'Price Date' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Price Date' }).click();
  const gpDate = await page.getByRole('textbox', { name: 'Price Date' }).inputValue();

  // Add the price
  const goldPrice = "141.90";
  await page.getByRole('spinbutton', { name: 'BRL per Gram' }).click();
  await page.getByRole('spinbutton', { name: 'BRL per Gram' }).fill(goldPrice);

  // Add notes
  const gpNotes = generateUniqueString();
  await page.getByRole('textbox', { name: 'Notes' }).click();
  await page.getByRole('textbox', { name: 'Notes' }).fill(gpNotes);

  // Record the gold price
  await page.getByRole('button', { name: 'Record Gold Price' }).click();

  // Locate the table by role
  await expect(page.locator('[data-testid="gold-prices-table"]')).toBeVisible();
  const table = page.locator('[data-testid="gold-prices-table"]');

  // Locate the row containing the unique notes value from this run.
  const targetRow = table.getByRole("row").filter({ hasText: gpNotes });
  await expect(targetRow).toBeVisible();

  // Validate individual cells in that row
  await expect(targetRow.getByRole('cell').nth(0)).toHaveText(gpDate);    // Date
  await expect(targetRow.getByRole('cell').nth(1)).toHaveText(formatBRL(Number(goldPrice))); // Gold Price
  await expect(targetRow.getByRole('cell').nth(3)).toHaveText(gpNotes);   // Notes
});

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}
