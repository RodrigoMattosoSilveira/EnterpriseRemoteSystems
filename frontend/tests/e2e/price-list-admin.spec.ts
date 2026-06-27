import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("admin can create Canteen and Administrative items and use them on New Expense", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const collaborator = await createActiveCollaborator(request, suffix);
  const canteenDescription = `E2E admin canteen item ${suffix}`;
  const administrativeDescription = `E2E admin administrative item ${suffix}`;

  await page.goto("/admin/price-list-items");

  await createPriceListItemThroughAdmin(page, {
    itemType: "CANTEEN",
    code: `E2E_CANTEEN_ADMIN_${suffix}`,
    description: canteenDescription,
    unitPriceBrl: "11.25",
    sortOrder: "71",
  });
  await expect(priceListRow(page, canteenDescription)).toBeVisible();

  await createPriceListItemThroughAdmin(page, {
    itemType: "ADMINISTRATIVE",
    code: `E2E_ADMIN_ADMIN_${suffix}`,
    description: administrativeDescription,
    unitPriceBrl: "44.90",
    sortOrder: "72",
  });
  await expect(priceListRow(page, administrativeDescription)).toBeVisible();

  await page.goto("/expenses/new");
  await expect(page.getByRole("heading", { name: "New Expense" })).toBeVisible();
  await page.getByLabel("Collaborator *").selectOption(collaborator.id);

  await page.getByLabel("Category *").selectOption("CANTEEN");
  await expectPriceListOption(page, canteenDescription, 1);

  await page.getByLabel("Category *").selectOption("ADMINISTRATIVE");
  await expectPriceListOption(page, administrativeDescription, 1);
});

test("admin can deactivate an item and still view it as inactive history", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  await createActiveCollaborator(request, suffix);
  const description = `E2E inactive administrative item ${suffix}`;

  await page.goto("/admin/price-list-items");
  await createPriceListItemThroughAdmin(page, {
    itemType: "ADMINISTRATIVE",
    code: `E2E_ADMIN_INACTIVE_${suffix}`,
    description,
    unitPriceBrl: "29.75",
    sortOrder: "73",
  });

  const activeRow = priceListRow(page, description);
  await expect(activeRow).toBeVisible();
  await activeRow.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("status")).toContainText(
    `Deactivated price-list item: ${description}.`,
  );

  await page.goto("/expenses/new");
  await expect(page.getByRole("heading", { name: "New Expense" })).toBeVisible();
  await page.getByLabel("Category *").selectOption("ADMINISTRATIVE");
  await expectPriceListOption(page, description, 0);

  await page.goto("/admin/price-list-items");
  await page.getByLabel("Include inactive").check();
  const inactiveRow = priceListRow(page, description);
  await expect(inactiveRow).toBeVisible();
  await expect(inactiveRow).toContainText("Inactive");
  await expect(inactiveRow.getByRole("button", { name: "Reactivate" })).toBeVisible();
});

test("admin edit creates a new active version and preserves inactive history", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  await createActiveCollaborator(request, suffix);
  const originalDescription = `E2E original canteen item ${suffix}`;
  const revisedDescription = `E2E revised canteen item ${suffix}`;

  await page.goto("/admin/price-list-items");
  await createPriceListItemThroughAdmin(page, {
    itemType: "CANTEEN",
    code: `E2E_CANTEEN_HISTORY_${suffix}`,
    description: originalDescription,
    unitPriceBrl: "8.10",
    sortOrder: "74",
  });

  await priceListRow(page, originalDescription).getByRole("button", { name: "Edit" }).click();
  const editForm = page.locator("form").filter({ hasText: `Edit ${originalDescription}` });
  await expect(editForm).toBeVisible();
  await editForm.getByLabel("Description").fill(revisedDescription);
  await editForm.getByLabel("BRL Unit Price").fill("9.55");
  await editForm.getByRole("button", { name: "Save Changes" }).click();

  await expect(page.getByRole("status")).toContainText(
    `Updated price-list item: ${revisedDescription}. The previous version was retained as inactive history.`,
  );
  const revisedRow = priceListRow(page, revisedDescription);
  await expect(revisedRow).toBeVisible();
  await expect(revisedRow).toContainText("Active");

  await page.getByLabel("Include inactive").check();
  const originalRow = priceListRow(page, originalDescription);
  await expect(originalRow).toBeVisible();
  await expect(originalRow).toContainText("Inactive");

  await page.goto("/expenses/new");
  await expect(page.getByRole("heading", { name: "New Expense" })).toBeVisible();
  await page.getByLabel("Category *").selectOption("CANTEEN");
  await expectPriceListOption(page, revisedDescription, 1);
  await expectPriceListOption(page, originalDescription, 0);
});

type PriceListFormInput = {
  itemType: "CANTEEN" | "ADMINISTRATIVE";
  code: string;
  description: string;
  unitPriceBrl: string;
  sortOrder: string;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
    fields?: Record<string, string>;
  };
};

type CreatedPerson = {
  id: string;
};

type CreatedCollaborator = {
  id: string;
};

async function createPriceListItemThroughAdmin(
  page: Page,
  input: PriceListFormInput,
) {
  await page.getByRole("button", { name: "Add Price List Item" }).click();
  const form = page.locator("form").filter({ hasText: "Create Price List Item" });
  await expect(form).toBeVisible();

  await form.getByLabel("Category").selectOption(input.itemType);
  await form.getByLabel("Code").fill(input.code);
  await form.getByLabel("Description").fill(input.description);
  await form.getByLabel("BRL Unit Price").fill(input.unitPriceBrl);
  await form.getByLabel("Sort Order").fill(input.sortOrder);

  const createResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith("/api/v1/price-list-items") &&
      response.request().method() === "POST"
    );
  });
  await form.getByRole("button", { name: "Create Item" }).click();
  const response = await createResponse;
  expect(response.ok()).toBeTruthy();

  await expect(page.getByRole("status")).toContainText(
    `Created price-list item: ${input.description}.`,
  );
  await expect(form).toHaveCount(0);
}

function priceListRow(page: Page, description: string) {
  return page.getByRole("row").filter({ hasText: description }).first();
}

async function expectPriceListOption(page: Page, description: string, count: number) {
  await expect(
    page.getByLabel("Item Description *").locator("option", { hasText: description }),
  ).toHaveCount(count);
}

async function createActiveCollaborator(
  api: APIRequestContext,
  suffix: number,
): Promise<CreatedCollaborator> {
  const person = await createCompletePerson(api, {
    suffix,
    firstName: `PriceListAdminE2E${suffix}`,
    nickname: `PriceListAdmin${suffix}`,
  });
  return createCollaborator(api, person.id);
}

async function createCompletePerson(
  api: APIRequestContext,
  input: { suffix: number; firstName: string; nickname: string },
): Promise<CreatedPerson> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const suffix = input.suffix + attempt * 97;
    const response = await api.post(e2eApiUrl("/api/v1/people"), {
      headers: authzHeaders(),
      data: completePersonPayload({ ...input, suffix }),
    });

    if (response.ok()) {
      const body = (await response.json()) as ApiEnvelope<CreatedPerson>;
      if (!body.data) {
        throw new Error("Create Person failed: response did not include data");
      }
      return body.data;
    }

    const text = await response.text();
    if (!/already exists/i.test(text) || attempt === 2) {
      throw new Error(
        `Create Person failed at ${response.url()}: ${response.status()} ${text}`,
      );
    }
  }

  throw new Error("Create Person failed after retrying unique identifiers");
}

async function createCollaborator(
  api: APIRequestContext,
  personId: string,
): Promise<CreatedCollaborator> {
  const response = await api.post(e2eApiUrl("/api/v1/collaborators"), {
    headers: authzHeaders(),
    data: {
      personId,
      journeyStartDate: todayISODate(),
      paymentMethodId: PAYMENT_METHOD_DAILY_ID,
      paymentValue: 250.75,
      sectorId: SECTOR_MINING_ID,
      locationId: LOCATION_MAIN_MINE_ID,
      taskId: TASK_MINER_ID,
      statusId: COLLABORATOR_STATUS_ACTIVE_ID,
      notes: "Created by Playwright price-list admin setup",
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Create Collaborator failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedCollaborator>;
  if (!body.data) {
    throw new Error("Create Collaborator failed: response did not include data");
  }
  return body.data;
}

function completePersonPayload({
  suffix,
  firstName,
  nickname,
}: {
  suffix: number;
  firstName: string;
  nickname: string;
}) {
  const emailLocal = String(suffix).replace(/\D/g, "");

  return {
    firstName,
    lastName: "Pessoa",
    nickname,
    cpf: validCPF(suffix),
    rg: validRG(suffix),
    cellular: validBrazilianCellular(suffix),
    email: `price-list-admin-e2e-${emailLocal}@example.com`,

    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",

    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-price-list-admin-e2e-${emailLocal}@example.com`,

    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-price-list-admin-e2e-${emailLocal}@example.com`,

    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright price-list admin setup",
  };
}

function uniqueSuffix(): number {
  return Number(
    `${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, "0")}`,
  );
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function validRG(seed: number): string {
  return `RG22C${String(seed).replace(/\D/g, "").slice(-12)}`;
}

function validBrazilianCellular(seed: number): string {
  const uniqueDigits = String(seed)
    .replace(/\D/g, "")
    .padStart(8, "0")
    .slice(-8);
  return `11${`9${uniqueDigits}`.slice(0, 9)}`;
}

function validCPF(seed: number): string {
  const base = String(seed).replace(/\D/g, "").padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);
  const d1 = cpfCheckDigit(digits);
  const d2 = cpfCheckDigit([...digits, d1]);

  return `${base}${d1}${d2}`;
}

function cpfCheckDigit(numbers: number[]): number {
  const weightStart = numbers.length + 1;
  const sum = numbers.reduce(
    (acc, digit, index) => acc + digit * (weightStart - index),
    0,
  );
  const remainder = sum % 11;

  return remainder < 2 ? 0 : 11 - remainder;
}
