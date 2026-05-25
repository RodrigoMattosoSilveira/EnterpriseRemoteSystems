import { expect, test } from "@playwright/test";

const ACTIVE_STATUS_ID = "ref-person-status-active";

function cpfCheckDigit(numbers: number[]): number {
  const weightStart = numbers.length + 1;

  const sum = numbers.reduce((acc, digit, index) => {
    return acc + digit * (weightStart - index);
  }, 0);

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function validCPF(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);

  const d1 = cpfCheckDigit(digits);
  const d2 = cpfCheckDigit([...digits, d1]);

  return `${base}${d1}${d2}`;
}

function uniqueSuffix(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function validRG(seed: number): string {
  return `RG-${String(seed).slice(-8)}`;
}

function validBrazilianCellular(seed: number): string {
  const ddd = 11 + (seed % 89);
  const subscriber = String(seed % 100_000_000).padStart(8, "0");

  return `${ddd}9${subscriber}`;
}

function formatBrazilianCellular(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

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

test("user sees required field validation on the create Person form", async ({ page }) => {
  await page.goto("/people/new");

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people\/new$/);

  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByLabel("Last name")).toBeVisible();
  await expect(page.getByLabel("CPF")).toBeVisible();
  await expect(page.getByLabel("RG")).toBeVisible();
  await expect(page.getByLabel("Cellular")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("user sees an error when creating a Person with a duplicate CPF", async ({ page }) => {
  const suffix = uniqueSuffix();

  const cpf = validCPF(suffix);
  const firstCellular = validBrazilianCellular(suffix);
  const secondCellular = validBrazilianCellular(suffix + 1);

  await page.goto("/people/new");

  await page.getByLabel("First name").fill(`Duplicate${suffix}`);
  await page.getByLabel("Last name").fill("CPF");
  await page.getByLabel("Nickname").fill(`Dup${suffix}`);
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("RG").fill(validRG(suffix));
  await page.getByLabel("Cellular").fill(validBrazilianCellular(suffix));
  await page.getByLabel("Email").fill(`duplicate-${suffix}@example.com`);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+$/);

  await page.goto("/people/new");

  await page.getByLabel("First name").fill(`DuplicateAgain${suffix}`);
  await page.getByLabel("Last name").fill("CPF");
  await page.getByLabel("Nickname").fill(`DupAgain${suffix}`);
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("RG").fill(`RG-DUP-${suffix}`);
  await page.getByLabel("Cellular").fill(secondCellular);
  await page.getByLabel("Email").fill(`duplicate-again-${suffix}@example.com`);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people\/new$/);
  await expect(page.getByText("CPF already exists")).toBeVisible();
});

test("user can create a Person with a valid Brazilian cellular", async ({ page }) => {
  const suffix = uniqueSuffix();
  const cellular = validBrazilianCellular(suffix + 10);

  await page.goto("/people/new");

  await page.getByLabel("First name").fill(`Formatted${suffix}`);
  await page.getByLabel("Last name").fill("Phone");
  await page.getByLabel("Nickname").fill(`Phone${suffix}`);
  await page.getByLabel("CPF").fill(validCPF(suffix + 10));
  await page.getByLabel("RG").fill(validRG(suffix + 10));
  await page.getByLabel("Cellular").fill(cellular);
  await page.getByLabel("Email").fill(`formatted-phone-${suffix}@example.com`);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people\/[a-f0-9-]+$/);
  await expect(page.getByRole("heading", { name: /Formatted.*Phone/ })).toBeVisible();
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

