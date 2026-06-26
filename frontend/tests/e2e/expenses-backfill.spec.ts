import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";
const EXPENSE_CATEGORY_CANTEEN_ID = "ref-expense-category-canteen";
const EXPENSE_CATEGORY_FLIGHT_ID = "ref-expense-category-flight";
const VALUE_UNIT_BRL_ID = "ref-value-unit-brl";

const ITEM_TYPE_CANTEEN = "CANTEEN";
const ITEM_TYPE_ADMINISTRATIVE = "ADMINISTRATIVE";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("backfilled legacy Canteen expense appears as Canteen", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personNickname = `LegacyCanteen${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `LegacyCanteenE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const description = `Backfilled legacy Canteen expense ${suffix}`;

  await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_CANTEEN_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 15.75,
    expenseDate: "2026-07-01",
    description,
  });

  await page.goto(`/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}`);
  await selectCategoryFilter(page, ITEM_TYPE_CANTEEN, collaborator.id);

  const row = expenseRow(page, description);
  await expect(row).toBeVisible();
  await expect(row).toContainText(personNickname);
  await expect(row).toContainText("Canteen");
  await expect(row).toContainText("LEGACY_CANTEEN_DIRECT_ENTRY");
});

test("backfilled legacy Administrative expense appears as Administrative", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personNickname = `LegacyAdmin${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `LegacyAdminE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const description = `Backfilled legacy Administrative expense ${suffix}`;

  await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_FLIGHT_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 420.5,
    expenseDate: "2026-07-02",
    description,
  });

  await page.goto(`/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}`);
  await selectCategoryFilter(page, ITEM_TYPE_ADMINISTRATIVE, collaborator.id);

  const row = expenseRow(page, description);
  await expect(row).toBeVisible();
  await expect(row).toContainText(personNickname);
  await expect(row).toContainText("Administrative");
  await expect(row).toContainText("LEGACY_ADMINISTRATIVE_DIRECT_ENTRY");
});

test("price-list expense still works after legacy backfill", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personNickname = `BackfillPriceList${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `BackfillPriceListE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);

  await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_FLIGHT_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 99.5,
    expenseDate: "2026-07-03",
    description: `Legacy row before price-list expense ${suffix}`,
  });

  const item = await createPriceListItem(request, {
    itemType: ITEM_TYPE_CANTEEN,
    code: `E2E-BACKFILL-CANTEEN-${suffix}`,
    description: `Backfill canteen item ${suffix}`,
    unitPriceBrl: 18.75,
    sortOrder: 40,
  });
  const description = `Price-list expense after legacy backfill ${suffix}`;

  await createExpense(request, {
    collaboratorId: collaborator.id,
    priceListItemId: item.id,
    currencyCode: "BRL",
    quantity: 3,
    expenseDate: "2026-07-04",
    description,
  });

  await page.goto(`/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}`);
  await selectCategoryFilter(page, ITEM_TYPE_CANTEEN, collaborator.id);

  const categoryRow = expenseRow(page, description);
  await expect(categoryRow).toBeVisible();
  await expect(categoryRow).toContainText("Canteen");
  await expect(categoryRow).toContainText(item.description);
  await expect(categoryRow).toContainText(item.code);

  const listResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith("/api/v1/expenses") &&
      url.searchParams.get("priceListItemId") === item.id &&
      response.request().method() === "GET"
    );
  });
  await itemSelect(page).selectOption(item.id);
  await listResponse;

  await expect(itemSelect(page)).toHaveValue(item.id);
  await expect(expenseRow(page, description)).toContainText(personNickname);
});

test("grams-of-gold price-list expense shows conversion audit details", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personNickname = `BackfillGold${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `BackfillGoldE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const item = await createPriceListItem(request, {
    itemType: ITEM_TYPE_ADMINISTRATIVE,
    code: `E2E-BACKFILL-GOLD-${suffix}`,
    description: `Backfill gold admin item ${suffix}`,
    unitPriceBrl: 137.28,
    sortOrder: 50,
  });
  await createGoldPrice(request, {
    priceDate: "2099-12-31",
    brlPerGram: 137.28,
    recordedBy: "bootstrap-admin",
    notes: "E2E gold source for backfill audit coverage",
  });
  const description = `Gold price-list expense after legacy backfill ${suffix}`;

  const expense = await createExpense(request, {
    collaboratorId: collaborator.id,
    priceListItemId: item.id,
    currencyCode: "GOLD_GRAM",
    quantity: 2,
    expenseDate: "2026-07-05",
    description,
  });

  await page.goto(
    `/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}&itemType=${ITEM_TYPE_ADMINISTRATIVE}`,
  );

  const row = expenseRow(page, description);
  await expect(row).toBeVisible();
  await expect(row).toContainText("Administrative");
  await expect(row).toContainText(item.description);
  await expect(row).toContainText("2 g gold");

  await row.getByRole("link", { name: personNickname }).click();

  await expect(page).toHaveURL(new RegExp(`/expenses/${expense.id}$`));
  await expect(page.getByRole("heading", { name: "Administrative" })).toBeVisible();
  await expect(page.getByText("Calculation Audit")).toBeVisible();
  await expect(page.getByText(item.description)).toBeVisible();
  await expect(page.getByText(item.code)).toBeVisible();
  await expect(page.getByText("BRL to grams using latest gold price")).toBeVisible();
  await expect(page.getByText("2 g gold").first()).toBeVisible();
  await expect(page.getByText("Gold price source")).toBeVisible();
  await expect(page.locator("body")).toContainText("2099-12-31");
  await expect(page.locator("body")).toContainText("137,28");
});

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
    fields?: Record<string, string>;
  };
};

type CreatedPerson = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
};

type CreatedCollaborator = {
  id: string;
};

type Expense = {
  id: string;
  collaboratorId: string;
  expenseCategoryId?: string;
  valueUnitId?: string;
  amount?: number;
  expenseDate: string;
  description?: string;
  active?: boolean;
  priceListItemId?: string;
  priceListItemCode?: string;
  itemType?: string;
  itemDescription?: string;
  quantity?: number;
  currencyCode?: string;
  goldBrlPerGram?: number;
  goldPriceDate?: string;
  unitPriceAmount?: number;
  totalAmount?: number;
  calculationMethod?: string;
};

type ExpensePayload = {
  collaboratorId: string;
  expenseDate: string;
  description: string;
  expenseCategoryId?: string;
  valueUnitId?: string;
  amount?: number;
  priceListItemId?: string;
  currencyCode?: "BRL" | "GOLD_GRAM";
  quantity?: number;
};

type PriceListItemPayload = {
  itemType: "CANTEEN" | "ADMINISTRATIVE";
  code: string;
  description: string;
  unitPriceBrl: number;
  sortOrder?: number;
};

type PriceListItem = PriceListItemPayload & {
  id: string;
};

type GoldPricePayload = {
  priceDate: string;
  brlPerGram: number;
  recordedBy: string;
  notes: string;
};

function expenseRow(page: Page, description: string) {
  return page.getByRole("row").filter({ hasText: description }).first();
}

function itemSelect(page: Page) {
  return page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "All items" }) });
}

async function selectCategoryFilter(
  page: Page,
  itemType: string,
  collaboratorId: string,
) {
  const listResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith("/api/v1/expenses") &&
      url.searchParams.get("collaboratorId") === collaboratorId &&
      url.searchParams.get("itemType") === itemType &&
      response.request().method() === "GET"
    );
  });
  await page.getByLabel("Category").selectOption(itemType);
  await listResponse;
  await expect(page.getByLabel("Category")).toHaveValue(itemType);
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
      notes: "Created by Playwright expense backfill setup",
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Create Collaborator failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedCollaborator>;
  if (!body.data) {
    throw new Error(
      "Create Collaborator failed: response did not include data",
    );
  }
  return body.data;
}

async function createExpense(
  api: APIRequestContext,
  payload: ExpensePayload,
): Promise<Expense> {
  const response = await api.post(e2eApiUrl("/api/v1/expenses"), {
    headers: authzHeaders(),
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(
      `Create Expense failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<Expense>;
  if (!body.data) {
    throw new Error("Create Expense failed: response did not include data");
  }
  return body.data;
}

async function createPriceListItem(
  api: APIRequestContext,
  payload: PriceListItemPayload,
): Promise<PriceListItem> {
  const response = await api.post(e2eApiUrl("/api/v1/price-list-items"), {
    headers: authzHeaders(),
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(
      `Create Price List Item failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<PriceListItem>;
  if (!body.data) {
    throw new Error(
      "Create Price List Item failed: response did not include data",
    );
  }
  return body.data;
}

async function createGoldPrice(
  api: APIRequestContext,
  payload: GoldPricePayload,
) {
  const response = await api.post(e2eApiUrl("/api/v1/gold-prices"), {
    headers: authzHeaders(),
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(
      `Create Gold Price failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }
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
    email: `expense-backfill-e2e-${emailLocal}@example.com`,

    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",

    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-expense-backfill-e2e-${emailLocal}@example.com`,

    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-expense-backfill-e2e-${emailLocal}@example.com`,

    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright expense backfill setup",
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
  return `RG21E${String(seed).replace(/\D/g, "").slice(-12)}`;
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
