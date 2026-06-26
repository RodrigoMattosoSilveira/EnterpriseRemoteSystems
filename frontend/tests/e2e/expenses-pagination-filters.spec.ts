import { expect, test, type APIRequestContext } from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";
const EXPENSE_CATEGORY_CANTEEN_ID = "ref-expense-category-canteen";
const VALUE_UNIT_BRL_ID = "ref-value-unit-brl";

const EXPENSE_PAGE_SIZE = 50;
const EXPENSES_MINIMUM_FOR_SECOND_PAGE = EXPENSE_PAGE_SIZE + 1;

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("user can navigate additional Expenses pages", async ({
  page,
  request,
}) => {
  await ensureExpenseTotalAboveFirstPage(request);

  await page.goto("/expenses");

  await expect(
    page.getByRole("heading", { name: "Expenses", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Showing 50 of \d+ expense records\./),
  ).toBeVisible();
  await expect(page.getByText(/Page 1 of \d+/).first()).toBeVisible();

  const previousButton = page.getByRole("button", { name: "Previous" }).first();
  const nextButton = page.getByRole("button", { name: "Next" }).first();

  await expect(previousButton).toBeDisabled();
  await expect(nextButton).toBeEnabled();

  await nextButton.click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBe("2");
  await expect(page.getByText(/Page 2 of \d+/).first()).toBeVisible();
  await expect(previousButton).toBeEnabled();

  await previousButton.click();

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBeNull();
  await expect(page.getByText(/Page 1 of \d+/).first()).toBeVisible();
});

test("user can filter Expenses by collaborator", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const personNickname = `ExpenseFilterCollaborator${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ExpenseFilterCollaboratorE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const description = `Collaborator-filter expense ${suffix}`;

  await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_CANTEEN_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 18.25,
    expenseDate: "2026-06-21",
    description,
  });

  await page.goto("/expenses?page=2");

  const collaboratorSelect = page.getByLabel("Collaborator");
  await expect(collaboratorSelect).toContainText(personNickname);

  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/expenses") &&
      response
        .url()
        .includes(`collaboratorId=${encodeURIComponent(collaborator.id)}`) &&
      response.request().method() === "GET",
  );
  await collaboratorSelect.selectOption(collaborator.id);
  await listResponse;

  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBeNull();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("collaboratorId"))
    .toBe(collaborator.id);
  await expect(collaboratorSelect).toHaveValue(collaborator.id);
  await expect(page.getByText(/Page 1 of \d+/).first()).toBeVisible();
  const matchingRow = page
    .getByRole("row")
    .filter({ hasText: description })
    .first();
  await expect(matchingRow).toBeVisible();
  await expect(matchingRow.getByRole("link", { name: personNickname })).toBeVisible();
});

test("user can filter Expenses by item", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const personNickname = `ExpenseFilterItem${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ExpenseFilterItemE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const item = await createPriceListItem(request, {
    itemType: "CANTEEN",
    code: `E2E-SNACK-${suffix}`,
    description: `E2E snack ${suffix}`,
    unitPriceBrl: 9.75,
    sortOrder: 30,
  });
  const description = `Item-filter expense ${suffix}`;

  await createExpense(request, {
    collaboratorId: collaborator.id,
    priceListItemId: item.id,
    currencyCode: "BRL",
    quantity: 2,
    expenseDate: "2026-06-22",
    description,
  });

  await page.goto("/expenses?page=2");

  const itemTypeSelect = page.getByLabel("Item type");
  const itemSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: "All items" }) });

  const itemTypeResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/expenses") &&
      response.url().includes("itemType=CANTEEN") &&
      response.request().method() === "GET",
  );
  await itemTypeSelect.selectOption("CANTEEN");
  await itemTypeResponse;

  await expect(itemTypeSelect).toHaveValue("CANTEEN");
  await expect(itemSelect).toContainText(item.description);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("page"))
    .toBeNull();

  const itemTypeFilteredRow = page
    .getByRole("row")
    .filter({ hasText: item.description })
    .first();
  await expect(itemTypeFilteredRow).toBeVisible();
  await expect(itemTypeFilteredRow).toContainText(description);

  const itemResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/expenses") &&
      response
        .url()
        .includes(`priceListItemId=${encodeURIComponent(item.id)}`) &&
      response.request().method() === "GET",
  );
  await itemSelect.selectOption(item.id);
  await itemResponse;

  await expect(itemSelect).toHaveValue(item.id);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("priceListItemId"))
    .toBe(item.id);
  await expect(page.getByText(/Page 1 of \d+/).first()).toBeVisible();

  const matchingRow = page
    .getByRole("row")
    .filter({ hasText: item.description })
    .first();
  await expect(matchingRow).toContainText(item.code);
  await expect(matchingRow).toContainText(description);
  await expect(matchingRow).toContainText(personNickname);
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
  collaboratorLabel?: string;
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
  totalAmount?: number;
};

type ExpenseListResponse = {
  items: Expense[];
  total: number;
  page: number;
  pageSize: number;
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

type CreatedPriceListItem = {
  id: string;
  itemType: string;
  code: string;
  description: string;
  unitPriceBrl: number;
  active: boolean;
};

type PriceListItemPayload = {
  itemType: "CANTEEN" | "ADMINISTRATIVE";
  code: string;
  description: string;
  unitPriceBrl: number;
  sortOrder?: number;
};

async function createCompletePerson(
  api: APIRequestContext,
  input: { suffix: number; firstName: string; nickname: string },
): Promise<CreatedPerson> {
  const response = await api.post(e2eApiUrl("/api/v1/people"), {
    headers: authzHeaders(),
    data: completePersonPayload(input),
  });

  if (!response.ok()) {
    throw new Error(
      `Create Person failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedPerson>;
  if (!body.data) {
    throw new Error("Create Person failed: response did not include data");
  }
  return body.data;
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
      notes: "Created by Playwright expense filter setup",
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
): Promise<CreatedPriceListItem> {
  const response = await api.post(e2eApiUrl("/api/v1/price-list-items"), {
    headers: authzHeaders(),
    data: payload,
  });

  if (!response.ok()) {
    throw new Error(
      `Create Price List Item failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedPriceListItem>;
  if (!body.data) {
    throw new Error(
      "Create Price List Item failed: response did not include data",
    );
  }
  return body.data;
}

async function ensureExpenseTotalAboveFirstPage(
  api: APIRequestContext,
): Promise<void> {
  const existingTotal = await getExpenseTotal(api);
  if (existingTotal >= EXPENSES_MINIMUM_FOR_SECOND_PAGE) {
    return;
  }

  const suffix = uniqueSuffix();
  const person = await createCompletePerson(api, {
    suffix,
    firstName: `ExpensePaginationE2E${suffix}`,
    nickname: `ExpensePagination${suffix}`,
  });
  const collaborator = await createCollaborator(api, person.id);
  const needed = EXPENSES_MINIMUM_FOR_SECOND_PAGE - existingTotal;

  for (let index = 0; index < needed; index += 1) {
    await createExpense(api, {
      collaboratorId: collaborator.id,
      expenseCategoryId: EXPENSE_CATEGORY_CANTEEN_ID,
      valueUnitId: VALUE_UNIT_BRL_ID,
      amount: 1 + index,
      expenseDate: "2026-06-20",
      description: `Pagination seed expense ${suffix}-${index}`,
    });
  }
}

async function getExpenseTotal(api: APIRequestContext): Promise<number> {
  const response = await api.get(
    e2eApiUrl("/api/v1/expenses?page=1&pageSize=1"),
    {
      headers: authzHeaders(),
    },
  );

  if (!response.ok()) {
    throw new Error(
      `List Expenses failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<ExpenseListResponse>;
  return body.data?.total ?? 0;
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
    email: `expense-filter-e2e-${emailLocal}@example.com`,

    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",

    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-expense-filter-e2e-${emailLocal}@example.com`,

    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-expense-filter-e2e-${emailLocal}@example.com`,

    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright expense filter setup",
  };
}

function uniqueSuffix(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function validRG(seed: number): string {
  return `RGEXP${String(seed).replace(/\D/g, "").slice(-12)}`;
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
