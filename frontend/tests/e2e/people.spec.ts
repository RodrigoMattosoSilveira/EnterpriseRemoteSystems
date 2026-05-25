import { expect, test } from "@playwright/test";

const ACTIVE_STATUS_ID = "ref-person-status-active";

test("user can create a Person from the React frontend", async ({ page }) => {
  const unique = Date.now().toString().slice(-8);
  const firstName = `E2E${unique}`;
  const lastName = "Pessoa";
  const nickname = `Nick${unique}`;
  const cpf = generateCPF(unique);
  const rg = `RG${unique}`;
  const cellular = `119${unique.padStart(8, "0").slice(0, 8)}`;
  const email = `person-${unique}@example.com`;

  await page.goto("/people/new");

  await expect(page.getByRole("heading", { name: "New Person" })).toBeVisible();

  await page.getByLabel("First Name *").fill(firstName);
  await page.getByLabel("Last Name *").fill(lastName);
  await page.getByLabel("Nickname *").fill(nickname);
  await page.getByLabel("CPF *").fill(cpf);
  await page.getByLabel("RG *").fill(rg);
  await page.getByLabel("Cellular *").fill(cellular);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Status *").selectOption(ACTIVE_STATUS_ID);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: `${firstName} ${lastName}` })).toBeVisible();
  await expect(page.getByText(nickname)).toBeVisible();
  await expect(page.locator("header").getByText("Incomplete")).toBeVisible();

  await page.getByRole("link", { name: "Back to People" }).click();
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${firstName} ${lastName}` })).toBeVisible();
  await expect(page.getByText(`Nickname: ${nickname}`)).toBeVisible();
});

function generateCPF(seed: string): string {
  const digits = seed.replace(/\D/g, "").padStart(9, "1").slice(0, 9);
  const firstCheckDigit = calculateCPFCheckDigit(digits, 10);
  const secondCheckDigit = calculateCPFCheckDigit(`${digits}${firstCheckDigit}`, 11);

  return `${digits}${firstCheckDigit}${secondCheckDigit}`;
}

function calculateCPFCheckDigit(digits: string, weightStart: number): number {
  const sum = [...digits].reduce((total, digit, index) => {
    return total + Number(digit) * (weightStart - index);
  }, 0);

  const digit = 11 - (sum % 11);
  return digit >= 10 ? 0 : digit;
}
