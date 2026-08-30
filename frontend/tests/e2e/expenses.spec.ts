import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";
const EXPENSE_CATEGORY_CANTEEN_ID = "ref-expense-category-canteen";
const EXPENSE_CATEGORY_FLIGHT_ID = "ref-expense-category-flight";
const EXPENSE_CATEGORY_CARGO_ID = "ref-expense-category-cargo";
const VALUE_UNIT_BRL_ID = "ref-value-unit-brl";
const VALUE_UNIT_GOLD_GRAM_ID = "ref-value-unit-gold-gram";

const EXPENSE_QUANTITY = "3";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("user can create an Expense for an active Collaborator", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personNickname = `Expense${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ExpenseE2E${suffix}`,
    nickname: personNickname,
  });

  const collaborator = await createCollaborator(request, person.id);
  const item = await createPriceListItem(request, {
    itemType: "CANTEEN",
    code: `E2E_CANTEEN_${suffix}`,
    description: `E2E canteen snack ${suffix}`,
    unitPriceBrl: 12.25,
  });

  await page.goto("/expenses/new");

  await expect(
    page.getByRole("heading", { name: "New Expense" }),
  ).toBeVisible();

  await selectExpenseCollaborator(page, personNickname);
  await page.getByLabel("Category *").selectOption("CANTEEN");
  await page.getByLabel("Canteen item 1 description").selectOption(item.id);
  await page.getByLabel("Canteen item 1 currency").selectOption("BRL");
  await page.getByLabel("Canteen item 1 quantity").fill(EXPENSE_QUANTITY);
  await expect(page.getByText("Calculation preview")).toBeVisible();
  await expect(page.getByText("BRL price list").first()).toBeVisible();
  await page
    .getByLabel("Notes")
    .fill("Created by Playwright price-list expense flow");

  await page.getByRole("button", { name: "Create Expense" }).click();

  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByRole("status")).toContainText(
    `Expense created for ${personNickname}.`,
  );
  await expect(
    page.getByRole("heading", {
      name: "Expenses",
      exact: true,
    }),
  ).toBeVisible();

  const expensesResponse = await request.get(
    e2eApiUrl(
      `/api/v1/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}&pageSize=100`,
    ),
    { headers: authzHeaders() },
  );

  expect(expensesResponse.ok()).toBeTruthy();

  const expensesBody =
    (await expensesResponse.json()) as ApiEnvelope<ExpenseListResponse>;

  const matchingExpenses = (expensesBody.data?.items ?? []).filter(
    (expense) =>
      expense.description === "Created by Playwright price-list expense flow",
  );

  expect(matchingExpenses).toHaveLength(1);
  const createdExpense = matchingExpenses[0];
  expect(createdExpense).toBeDefined();
  expect(createdExpense?.financialPosting?.direction).toBe("DEBIT");
  expect(createdExpense?.financialPosting?.entryType).toBe("EXPENSE_DEDUCTION");
  expect(createdExpense?.financialPosting?.receiptStatus).toBe("PENDING_ISSUE");
  expect(createdExpense?.financialPosting?.outstandingReceipt).toBe(true);

  await page.goto(`/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}`);
  await expect(
    page.getByRole("link", { name: /Outstanding · Pending issue/ }).first(),
  ).toBeVisible();

  await page.goto(`/expenses/${createdExpense!.id}`);

  await expect(page.getByText(personNickname, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Canteen",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Created by Playwright price-list expense flow", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financial Posting" })).toBeVisible();
  await expect(page.getByText("Outstanding receipt:")).toBeVisible();
  await expect(page.locator("body")).toContainText("Receipt control");
  await expect(page.locator("body")).toContainText("Outstanding");
  await expect(page.getByRole("link", { name: "Print or return receipt" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View outstanding receipts" })).toBeVisible();
  expect(createdExpense?.priceListItemId).toBe(item.id);
  expect(createdExpense?.itemDescription).toBe(item.description);
  expect(createdExpense?.quantity).toBe(Number(EXPENSE_QUANTITY));
  expect(createdExpense?.currencyCode).toBe("BRL");
});

test("user can create a grams-of-gold Expense from the latest gold price", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personNickname = `GoldExpense${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `GoldExpenseE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const item = await createPriceListItem(request, {
    itemType: "ADMINISTRATIVE",
    code: `E2E_ADMIN_${suffix}`,
    description: `E2E admin supply ${suffix}`,
    unitPriceBrl: 137.28,
  });
  await createGoldPrice(request, {
    priceDate: "2099-06-25",
    brlPerGram: 137.28,
    recordedBy: "bootstrap-admin",
    notes: "E2E latest gold price for expense conversion",
  });

  await page.goto("/expenses/new");

  await selectExpenseCollaborator(page, personNickname);
  await page.getByLabel("Category *").selectOption("ADMINISTRATIVE");
  await page.getByLabel("Item Description *").selectOption(item.id);
  await page.getByLabel("Currency *").selectOption("GOLD_GRAM");
  await page.getByLabel("Quantity *").fill("2");
  await expect(page.getByText("Latest gold price source")).toContainText(
    "137,28",
  );
  await expect(page.getByText("2 g gold")).toBeVisible();
  await page
    .getByLabel("Notes")
    .fill("Gold conversion expense from Playwright");

  await page.getByRole("button", { name: "Create Expense" }).click();

  await expect(page).toHaveURL(/\/expenses$/);

  const expensesResponse = await request.get(
    e2eApiUrl(
      `/api/v1/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}&pageSize=100`,
    ),
    { headers: authzHeaders() },
  );
  expect(expensesResponse.ok()).toBeTruthy();
  const expensesBody =
    (await expensesResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  const createdExpense = expensesBody.data?.items.find(
    (expense) =>
      expense.description === "Gold conversion expense from Playwright",
  );

  expect(createdExpense).toBeDefined();
  expect(createdExpense?.priceListItemId).toBe(item.id);
  expect(createdExpense?.currencyCode).toBe("GOLD_GRAM");
  expect(createdExpense?.goldBrlPerGram).toBe(137.28);
  expect(createdExpense?.unitPriceAmount).toBe(1);
  expect(createdExpense?.totalAmount).toBe(2);
});

test("user can return from Expenses to People", async ({ page }) => {
  await page.goto("/expenses");

  await page.getByRole("link", { name: "People", exact: true }).click();

  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
});

test("user can open an Expense detail from the list", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personNickname = `ExpenseDetail${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ExpenseDetailE2E${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const expense = await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_FLIGHT_ID,
    valueUnitId: VALUE_UNIT_GOLD_GRAM_ID,
    amount: 2.75,
    expenseDate: "2099-06-02",
    description: `Gold-denominated flight expense ${suffix}`,
  });

  await page.goto("/expenses");

  await page.getByRole("link", { name: new RegExp(personNickname) }).click();

  await expect(page).toHaveURL(new RegExp(`/expenses/${expense.id}$`));
  await expect(page.getByRole("heading", { name: "Administrative" })).toBeVisible();
  await expect(page.getByText(personNickname, { exact: true })).toBeVisible();
  await expect(
    page.getByText(`Gold-denominated flight expense ${suffix}`, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Gold Gram")).toBeVisible();
});

test("expenses API supports filters and pagination from the browser test flow", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ExpenseFilterE2E${suffix}`,
    nickname: `ExpenseFilter${suffix}`,
  });
  const collaborator = await createCollaborator(request, person.id);

  const canteen = await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_CANTEEN_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 10,
    expenseDate: "2026-06-01",
    description: `Filter canteen ${suffix}`,
  });
  const flight = await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_FLIGHT_ID,
    valueUnitId: VALUE_UNIT_GOLD_GRAM_ID,
    amount: 2.5,
    expenseDate: "2026-06-02",
    description: `Filter flight ${suffix}`,
  });
  await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_CARGO_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 30,
    expenseDate: "2026-06-10",
    description: `Filter cargo ${suffix}`,
  });

  const categoryResponse = await request.get(
    e2eApiUrl(
      `/api/v1/expenses?collaboratorId=${collaborator.id}&expenseCategoryId=${EXPENSE_CATEGORY_FLIGHT_ID}&valueUnitId=${VALUE_UNIT_GOLD_GRAM_ID}`,
    ),
    { headers: authzHeaders() },
  );
  expect(categoryResponse.ok()).toBeTruthy();
  const categoryBody =
    (await categoryResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(categoryBody.data?.total).toBe(1);
  expect(categoryBody.data?.items).toHaveLength(1);
  expect(categoryBody.data?.items[0]?.id).toBe(flight.id);

  const dateResponse = await request.get(
    e2eApiUrl(
      `/api/v1/expenses?collaboratorId=${collaborator.id}&dateFrom=2026-06-01&dateTo=2026-06-01`,
    ),
    { headers: authzHeaders() },
  );
  expect(dateResponse.ok()).toBeTruthy();
  const dateBody =
    (await dateResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(dateBody.data?.total).toBe(1);
  expect(dateBody.data?.items[0]?.id).toBe(canteen.id);

  const pageOneResponse = await request.get(
    e2eApiUrl(
      `/api/v1/expenses?collaboratorId=${collaborator.id}&page=1&pageSize=2`,
    ),
    { headers: authzHeaders() },
  );
  expect(pageOneResponse.ok()).toBeTruthy();
  const pageOneBody =
    (await pageOneResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(pageOneBody.data?.total).toBe(3);
  expect(pageOneBody.data?.page).toBe(1);
  expect(pageOneBody.data?.pageSize).toBe(2);
  expect(pageOneBody.data?.items).toHaveLength(2);

  const pageTwoResponse = await request.get(
    e2eApiUrl(
      `/api/v1/expenses?collaboratorId=${collaborator.id}&page=2&pageSize=2`,
    ),
    { headers: authzHeaders() },
  );
  expect(pageTwoResponse.ok()).toBeTruthy();
  const pageTwoBody =
    (await pageTwoResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(pageTwoBody.data?.total).toBe(3);
  expect(pageTwoBody.data?.page).toBe(2);
  expect(pageTwoBody.data?.items).toHaveLength(1);
});

test("expenses API supports update and soft delete from the browser test flow", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ExpenseUpdateE2E${suffix}`,
    nickname: `ExpenseUpdate${suffix}`,
  });
  const collaborator = await createCollaborator(request, person.id);
  const expense = await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_CANTEEN_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 15,
    expenseDate: "2026-06-03",
    description: `Original expense ${suffix}`,
  });

  const updateResponse = await request.patch(
    e2eApiUrl(`/api/v1/expenses/${expense.id}`),
    {
      headers: authzHeaders(),
      data: {
        collaboratorId: collaborator.id,
        expenseCategoryId: EXPENSE_CATEGORY_FLIGHT_ID,
        valueUnitId: VALUE_UNIT_GOLD_GRAM_ID,
        amount: 3.75,
        expenseDate: "2026-06-04",
        description: `Updated expense ${suffix}`,
      },
    },
  );
  expect(updateResponse.ok()).toBeTruthy();
  const updateBody = (await updateResponse.json()) as ApiEnvelope<Expense>;
  expect(updateBody.data?.expenseCategoryId).toBe(EXPENSE_CATEGORY_FLIGHT_ID);
  expect(updateBody.data?.valueUnitId).toBe(VALUE_UNIT_GOLD_GRAM_ID);
  expect(updateBody.data?.amount).toBe(3.75);
  expect(updateBody.data?.expenseDate).toBe("2026-06-04");

  const deleteResponse = await request.delete(
    e2eApiUrl(`/api/v1/expenses/${expense.id}`),
    {
      headers: authzHeaders(),
    },
  );
  expect(deleteResponse.status()).toBe(204);

  const defaultListResponse = await request.get(
    e2eApiUrl(`/api/v1/expenses?collaboratorId=${collaborator.id}`),
    { headers: authzHeaders() },
  );
  expect(defaultListResponse.ok()).toBeTruthy();
  const defaultListBody =
    (await defaultListResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(
    defaultListBody.data?.items.some((item) => item.id === expense.id),
  ).toBe(false);

  const inactiveListResponse = await request.get(
    e2eApiUrl(
      `/api/v1/expenses?collaboratorId=${collaborator.id}&includeInactive=true`,
    ),
    { headers: authzHeaders() },
  );
  expect(inactiveListResponse.ok()).toBeTruthy();
  const inactiveListBody =
    (await inactiveListResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  const inactiveExpense = inactiveListBody.data?.items.find(
    (item) => item.id === expense.id,
  );
  expect(inactiveExpense?.active).toBe(false);
});

test("expenses API rejects expenses for non-active Collaborators", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ExpenseClosedE2E${suffix}`,
    nickname: `ExpenseClosed${suffix}`,
  });
  const collaborator = await createCollaborator(request, person.id, {
    statusId: "ref-collaborator-status-finished",
  });

  const response = await request.post(e2eApiUrl("/api/v1/expenses"), {
    headers: authzHeaders(),
    data: {
      collaboratorId: collaborator.id,
      expenseCategoryId: EXPENSE_CATEGORY_CANTEEN_ID,
      valueUnitId: VALUE_UNIT_BRL_ID,
      amount: 12.5,
      expenseDate: "2026-06-05",
      description: "Should be rejected for finished Collaborator",
    },
  });

  expect(response.status()).toBe(400);
  const body = (await response.json()) as ApiEnvelope<unknown>;
  expect(body.error?.fields?.collaboratorId).toMatch(/active and open/i);
});

test("user sees client-side validation on the create Expense form", async ({
  page,
}) => {
  await page.goto("/expenses/new");

  await expect(
    page.getByRole("heading", { name: "New Expense" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create Expense" }).click();

  await expect(page).toHaveURL(/\/expenses\/new$/);
  await expect(page.locator("body")).toContainText(
    /select an active collaborator/i,
  );
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
  expenseCategoryId: string;
  valueUnitId: string;
  amount: number;
  expenseDate: string;
  description?: string;
  active: boolean;
  priceListItemId?: string;
  itemDescription?: string;
  currencyCode?: string;
  quantity?: number;
  goldBrlPerGram?: number;
  unitPriceAmount?: number;
  totalAmount?: number;
  financialPosting?: {
    ledgerEntryId: string;
    direction: string;
    entryType: string;
    receiptStatus: string;
    outstandingReceipt: boolean;
  };
};

type ExpenseListResponse = {
  items: Expense[];
  total: number;
  page: number;
  pageSize: number;
};

type ExpensePayload = {
  collaboratorId: string;
  expenseCategoryId: string;
  valueUnitId: string;
  amount: number;
  expenseDate: string;
  description: string;
};

type PriceListItemPayload = {
  itemType: "CANTEEN" | "ADMINISTRATIVE";
  code: string;
  description: string;
  unitPriceBrl: number;
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

async function selectExpenseCollaborator(page: Page, nickname: string) {
  const collaboratorSearch = page.getByRole("combobox", {
    name: "Collaborator *",
  });
  await collaboratorSearch.fill(nickname);

  const collaboratorOption = page
    .getByRole("listbox", { name: "Matching active collaborators" })
    .getByRole("option", { name: new RegExp(nickname) });

  await expect(collaboratorOption).toBeVisible();
  await collaboratorOption.click();
  await expect(
    page.getByRole("status", { name: "Selected expense Collaborator" }),
  ).toContainText(nickname);
}

async function createCompletePerson(
  api: APIRequestContext,
  input: { suffix: number; firstName: string; nickname: string },
): Promise<CreatedPerson> {
  let lastFailure = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? input.suffix : uniqueSuffix();
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

    lastFailure = `${response.status()} ${await response.text()}`;
    if (
      response.status() !== 400 ||
      !isRetryablePersonIdentifierCollision(lastFailure)
    ) {
      throw new Error(
        `Create Person failed at ${response.url()}: ${lastFailure}`,
      );
    }
  }

  throw new Error(
    `Create Person failed after retrying unique identifiers: ${lastFailure}`,
  );
}

async function createCollaborator(
  api: APIRequestContext,
  personId: string,
  overrides: Partial<{ statusId: string }> = {},
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
      statusId: overrides.statusId ?? COLLABORATOR_STATUS_ACTIVE_ID,
      notes: "Created by Playwright expense setup",
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

async function createPriceListItem(
  api: APIRequestContext,
  payload: PriceListItemPayload,
): Promise<PriceListItem> {
  const response = await api.post(e2eApiUrl("/api/v1/price-list-items"), {
    headers: authzHeaders(),
    data: {
      ...payload,
      sortOrder: 10,
    },
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
    email: `expense-e2e-${emailLocal}@example.com`,

    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",

    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-expense-e2e-${emailLocal}@example.com`,

    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-expense-e2e-${emailLocal}@example.com`,

    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright expense setup",
  };
}

let uniqueSuffixCounter = 0;

function uniqueSuffix(): number {
  uniqueSuffixCounter += 1;
  const timePrefix = Date.now() % 1_000_000;
  const randomTail = Math.floor(10_000_000 + Math.random() * 90_000_000);
  return Number(`${timePrefix}${randomTail}`) + uniqueSuffixCounter;
}

function isRetryablePersonIdentifierCollision(errorText: string): boolean {
  return /CPF already exists|RG already exists|Cellular already exists|Email already exists|PIX key already exists/i.test(
    errorText,
  );
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function validRG(seed: number): string {
  return `RG-EXP-${String(seed).slice(-8)}`;
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
