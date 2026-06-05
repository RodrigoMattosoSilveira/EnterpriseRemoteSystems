import { expect, test, type APIRequestContext } from "@playwright/test";

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

const EXPENSE_AMOUNT = "123.45";

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

  await page.goto("/expenses/new");

  await expect(
    page.getByRole("heading", { name: "New Expense" }),
  ).toBeVisible();

  await expect(page.getByLabel("Collaborator *")).toContainText(personNickname);
  await page.getByLabel("Collaborator *").selectOption(collaborator.id);
  await page
    .getByLabel("Expense Category *")
    .selectOption(EXPENSE_CATEGORY_CANTEEN_ID);
  await page.getByLabel("Value Unit *").selectOption(VALUE_UNIT_BRL_ID);
  await page.getByLabel("Amount *").fill(EXPENSE_AMOUNT);
  await page
    .getByLabel("Description")
    .fill("Created by Playwright expense flow");

  await page.getByRole("button", { name: "Create Expense" }).click();

  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByRole("status")).toContainText(
    `Expense created for ${personNickname}.`,
  );
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(personNickname) }),
  ).toBeVisible();
  await expect(page.getByText("Canteen").first()).toBeVisible();
  await expect(
    page.getByText("Created by Playwright expense flow").first(),
  ).toBeVisible();
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
    expenseDate: "2026-06-02",
    description: "Gold-denominated flight expense",
  });

  await page.goto("/expenses");

  await page.getByRole("link", { name: new RegExp(personNickname) }).click();

  await expect(page).toHaveURL(new RegExp(`/expenses/${expense.id}$`));
  await expect(page.getByRole("heading", { name: "Flight" })).toBeVisible();
  await expect(page.getByText(personNickname)).toBeVisible();
  await expect(page.getByText("Gold-denominated flight expense")).toBeVisible();
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
    `/api/v1/expenses?collaboratorId=${collaborator.id}&expenseCategoryId=${EXPENSE_CATEGORY_FLIGHT_ID}&valueUnitId=${VALUE_UNIT_GOLD_GRAM_ID}`,
  );
  expect(categoryResponse.ok()).toBeTruthy();
  const categoryBody =
    (await categoryResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(categoryBody.data?.total).toBe(1);
  expect(categoryBody.data?.items).toHaveLength(1);
  expect(categoryBody.data?.items[0]?.id).toBe(flight.id);

  const dateResponse = await request.get(
    `/api/v1/expenses?collaboratorId=${collaborator.id}&dateFrom=2026-06-01&dateTo=2026-06-01`,
  );
  expect(dateResponse.ok()).toBeTruthy();
  const dateBody =
    (await dateResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(dateBody.data?.total).toBe(1);
  expect(dateBody.data?.items[0]?.id).toBe(canteen.id);

  const pageOneResponse = await request.get(
    `/api/v1/expenses?collaboratorId=${collaborator.id}&page=1&pageSize=2`,
  );
  expect(pageOneResponse.ok()).toBeTruthy();
  const pageOneBody =
    (await pageOneResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(pageOneBody.data?.total).toBe(3);
  expect(pageOneBody.data?.page).toBe(1);
  expect(pageOneBody.data?.pageSize).toBe(2);
  expect(pageOneBody.data?.items).toHaveLength(2);

  const pageTwoResponse = await request.get(
    `/api/v1/expenses?collaboratorId=${collaborator.id}&page=2&pageSize=2`,
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

  const updateResponse = await request.patch(`/api/v1/expenses/${expense.id}`, {
    data: {
      collaboratorId: collaborator.id,
      expenseCategoryId: EXPENSE_CATEGORY_FLIGHT_ID,
      valueUnitId: VALUE_UNIT_GOLD_GRAM_ID,
      amount: 3.75,
      expenseDate: "2026-06-04",
      description: `Updated expense ${suffix}`,
    },
  });
  expect(updateResponse.ok()).toBeTruthy();
  const updateBody = (await updateResponse.json()) as ApiEnvelope<Expense>;
  expect(updateBody.data?.expenseCategoryId).toBe(EXPENSE_CATEGORY_FLIGHT_ID);
  expect(updateBody.data?.valueUnitId).toBe(VALUE_UNIT_GOLD_GRAM_ID);
  expect(updateBody.data?.amount).toBe(3.75);
  expect(updateBody.data?.expenseDate).toBe("2026-06-04");

  const deleteResponse = await request.delete(`/api/v1/expenses/${expense.id}`);
  expect(deleteResponse.status()).toBe(204);

  const defaultListResponse = await request.get(
    `/api/v1/expenses?collaboratorId=${collaborator.id}`,
  );
  expect(defaultListResponse.ok()).toBeTruthy();
  const defaultListBody =
    (await defaultListResponse.json()) as ApiEnvelope<ExpenseListResponse>;
  expect(
    defaultListBody.data?.items.some((item) => item.id === expense.id),
  ).toBe(false);

  const inactiveListResponse = await request.get(
    `/api/v1/expenses?collaboratorId=${collaborator.id}&includeInactive=true`,
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

  const response = await request.post("/api/v1/expenses", {
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

async function createCompletePerson(
  api: APIRequestContext,
  input: { suffix: number; firstName: string; nickname: string },
): Promise<CreatedPerson> {
  const response = await api.post("/api/v1/people", {
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
  overrides: Partial<{ statusId: string }> = {},
): Promise<CreatedCollaborator> {
  const response = await api.post("/api/v1/collaborators", {
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

async function createExpense(
  api: APIRequestContext,
  payload: ExpensePayload,
): Promise<Expense> {
  const response = await api.post("/api/v1/expenses", { data: payload });

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

function uniqueSuffix(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
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
