import { expect, test, type APIRequestContext } from "@playwright/test";
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

test("user can create a Collaborator from an eligible complete Person", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const personName = `CollabE2E${suffix}`;
  const personLastName = firstPageSortLastName(suffix);
  const personNickname = `Eligible${suffix}`;
  const personDisplayName = `${personName} ${personLastName} (${personNickname})`;

  const person = await createCompletePerson(request, {
    suffix,
    firstName: personName,
    lastName: personLastName,
    nickname: personNickname,
  });

  await page.goto("/collaborators/new");

  await expect(
    page.getByRole("heading", { name: "New Collaborator" }),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Select an eligible Person" }),
  ).toBeVisible();

  const personSelect = page.getByLabel("Eligible Person *");
  await expect(personSelect).toBeEnabled();
  await expect(personSelect).toContainText(personDisplayName);

  await personSelect.selectOption(person.id);

  await expect(page.getByText("Selected Person is complete.")).toBeVisible();

  await expect(
    page.getByRole("paragraph").filter({ hasText: personDisplayName }),
  ).toBeVisible();

  await page.getByLabel("Status *").selectOption(COLLABORATOR_STATUS_ACTIVE_ID);
  await page.getByLabel("Sector *").selectOption(SECTOR_MINING_ID);
  await page.getByLabel("Location *").selectOption(LOCATION_MAIN_MINE_ID);
  await page.getByLabel("Task *").selectOption(TASK_MINER_ID);
  await page
    .getByLabel("Payment Method *")
    .selectOption(PAYMENT_METHOD_DAILY_ID);
  await page.getByLabel("Payment Value *").fill("250.75");

  await page
    .getByLabel("Notes")
    .fill("Created by Playwright create-collaborator flow");

  const createButton = page.getByRole("button", {
    name: "Create Collaborator",
  });

  await expect(createButton).toBeEnabled();
  await createButton.click();

  await expect(page).toHaveURL(/\/collaborators$/);

  await expect(page.getByRole("status")).toContainText(
    `Collaborator created for ${personNickname}.`,
  );

  await expect(
    page.getByRole("heading", {
      name: "Collaborators",
      exact: true,
    }),
  ).toBeVisible();

  await expect(
    page.getByRole("link", { name: new RegExp(personNickname) }),
  ).toBeVisible();

  await expect(page.getByText("Miner").first()).toBeVisible();
  await expect(page.getByText("Daily wage").first()).toBeVisible();

  await page.goto("/collaborators/new");

  await expect(
    page.getByText(
      "Already active Collaborators are hidden from the dropdown.",
    ),
  ).toBeVisible();

  await expect(page.getByText(personDisplayName)).toHaveCount(1);

  const refreshedPersonSelect = page.getByLabel("Eligible Person *");

  await expect(refreshedPersonSelect).not.toContainText(personDisplayName);
});

test("user can edit Collaborator assignment payment and extension days", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `EditCollab${suffix}`,
    lastName: firstPageSortLastName(suffix),
    nickname: `EditC${suffix}`,
  });
  const sector = await createReferenceData(request, "sector", {
    code: `E2E_SECTOR_${suffix}`,
    label: `E2E Sector ${suffix}`,
    sortOrder: 100,
  });
  const location = await createReferenceData(request, "location", {
    code: `E2E_LOCATION_${suffix}`,
    label: `E2E Location ${suffix}`,
    sortOrder: 100,
  });
  const task = await createReferenceData(request, "task", {
    code: `E2E_TASK_${suffix}`,
    label: `E2E Task ${suffix}`,
    sortOrder: 100,
  });
  const collaborator = await createCollaborator(request, {
    personId: person.id,
    journeyStartDate: "2026-06-01",
    paymentMethodId: PAYMENT_METHOD_DAILY_ID,
    paymentValue: 150,
    dailyBrlAmount: 150,
    sectorId: SECTOR_MINING_ID,
    locationId: LOCATION_MAIN_MINE_ID,
    taskId: TASK_MINER_ID,
    statusId: COLLABORATOR_STATUS_ACTIVE_ID,
    notes: "Collaborator edit E2E setup",
  });

  await page.goto(`/collaborators/${collaborator.id}`);

  await expect(
    page.getByRole("heading", { name: `EditC${suffix}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit Collaborator" }).click();

  await expect(
    page.getByRole("heading", { name: "Edit Collaborator" }),
  ).toBeVisible();

  await page.getByLabel("Sector *").selectOption(sector.id);
  await page.getByLabel("Location *").selectOption(location.id);
  await page.getByLabel("Task *").selectOption(task.id);
  await page.getByLabel("Payment Method *").selectOption("ref-method-salary");
  await page.getByLabel("Payment Value *").fill("2400");
  await page.getByLabel("Extension Days *").fill("12");

  await page.getByRole("button", { name: "Save Collaborator" }).click();

  await expect(page.getByRole("status")).toContainText(
    `Collaborator updated for EditC${suffix}.`,
  );
  await expect(page.getByText(sector.label).first()).toBeVisible();
  await expect(page.getByText(location.label).first()).toBeVisible();
  await expect(page.getByText(task.label).first()).toBeVisible();
  await expect(page.getByText("Salary").first()).toBeVisible();
  await expect(page.getByText(/R\$\s*2\.400,00/).first()).toBeVisible();
  await expect(page.getByText("2026-09-11").first()).toBeVisible();
});

test("user can inspect Collaborator current account ledger and receipt status", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `AccountCollab${suffix}`,
    lastName: firstPageSortLastName(suffix),
    nickname: `AcctC${suffix}`,
  });
  const collaborator = await createCollaborator(request, {
    personId: person.id,
    journeyStartDate: "2026-06-01",
    paymentMethodId: PAYMENT_METHOD_DAILY_ID,
    paymentValue: 150,
    dailyBrlAmount: 150,
    sectorId: SECTOR_MINING_ID,
    locationId: LOCATION_MAIN_MINE_ID,
    taskId: TASK_MINER_ID,
    statusId: COLLABORATOR_STATUS_ACTIVE_ID,
    notes: "Current account E2E setup",
  });
  const expense = await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: "ref-expense-category-canteen",
    valueUnitId: "ref-value-unit-brl",
    amount: 42.5,
    expenseDate: "2026-06-27",
    description: `Current account expense ${suffix}`,
  });

  await page.goto(`/collaborators/${collaborator.id}`);

  await page.getByRole("link", { name: "Current Account" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/collaborators/${collaborator.id}/current-account$`),
  );
  await expect(
    page.getByRole("heading", { name: `AcctC${suffix}` }),
  ).toBeVisible();
  await expect(page.getByText(/-R\$\s*42,50/).first()).toBeVisible();
  await expect(page.getByText("expense deduction").first()).toBeVisible();
  await expect(page.getByText("Receipt: Pending issue").first()).toBeVisible();
  await expect(page.getByText("Outstanding receipt:").first()).toBeVisible();

  await page
    .getByLabel("Filter ledger entries")
    .selectOption("outstanding-receipts");
  await expect(
    page.getByText("Showing page 1 of 1 · 1 ledger entry"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Open source" }).click();
  await expect(page).toHaveURL(new RegExp(`/expenses/${expense.id}$`));
});

test("current account updates after receipt signed return", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ReturnAcct${suffix}`,
    lastName: firstPageSortLastName(suffix),
    nickname: `RetAcct${suffix}`,
  });
  const collaborator = await createCollaborator(request, {
    personId: person.id,
    journeyStartDate: "2026-06-01",
    paymentMethodId: PAYMENT_METHOD_DAILY_ID,
    paymentValue: 150,
    dailyBrlAmount: 150,
    sectorId: SECTOR_MINING_ID,
    locationId: LOCATION_MAIN_MINE_ID,
    taskId: TASK_MINER_ID,
    statusId: COLLABORATOR_STATUS_ACTIVE_ID,
    notes: "Current account returned receipt E2E setup",
  });
  const expense = await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: "ref-expense-category-canteen",
    valueUnitId: "ref-value-unit-brl",
    amount: 19.75,
    expenseDate: "2026-06-27",
    description: `Current account returned receipt ${suffix}`,
  });
  const currentAccountUrl = `/collaborators/${collaborator.id}/current-account`;

  await page.goto(currentAccountUrl);

  await expect(page.getByText(/-R\$\s*19,75/).first()).toBeVisible();
  await expect(page.getByText("Receipt: Pending issue").first()).toBeVisible();
  await expect(page.getByText("Outstanding receipt:").first()).toBeVisible();

  await page.getByRole("link", { name: "Print or return receipt" }).click();
  await expect(
    page.getByRole("heading", { name: "Receipt", exact: true }),
  ).toBeVisible();

  await page
    .getByLabel("Signed document reference")
    .fill(`current-account-return-${suffix}.pdf`);
  await page
    .getByLabel("Notes")
    .fill("Returned from Current Account E2E flow.");
  await page.getByRole("button", { name: "Record signed return" }).click();

  await expect(
    page.getByText("Returned", { exact: true }).first(),
  ).toBeVisible();

  await page.goto(currentAccountUrl);
  await expect(page.getByText("Receipt: Returned").first()).toBeVisible();
  await expect(
    page.getByText("Receipt returned or closed.").first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open source" })).toHaveAttribute(
    "href",
    `/expenses/${expense.id}`,
  );

  await page
    .getByLabel("Filter ledger entries")
    .selectOption("outstanding-receipts");
  await expect(
    page.getByText("No ledger entries in this filter"),
  ).toBeVisible();
  await expect(
    page.getByText("Showing page 1 of 1 · 0 ledger entries"),
  ).toBeVisible();

  await page.goto("/receipts/outstanding");
  await page.getByLabel("Source type").selectOption("EXPENSE");
  await page.getByLabel("Collaborator").fill(`RetAcct${suffix}`);
  await page.getByRole("button", { name: "Apply filters" }).click();

  await expect(page.getByText("No outstanding receipts")).toBeVisible();
  await expect(
    page.getByText("Showing page 1 of 1 · 0 receipts"),
  ).toBeVisible();
});

type CreatedPerson = {
  id: string;
  firstName: string;
  lastName: string;
  nickname: string;
};

type CreatedCollaborator = {
  id: string;
};

type CreatedReferenceData = {
  id: string;
  label: string;
};

type CreatedExpense = {
  id: string;
};

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    message?: string;
    fields?: Record<string, string>;
  };
};

async function createCollaborator(
  api: APIRequestContext,
  data: Record<string, unknown>,
): Promise<CreatedCollaborator> {
  const response = await api.post(e2eApiUrl("/api/v1/collaborators"), {
    headers: authzHeaders(),
    data,
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
  data: Record<string, unknown>,
): Promise<CreatedExpense> {
  const response = await api.post(e2eApiUrl("/api/v1/expenses"), {
    headers: authzHeaders(),
    data,
  });

  if (!response.ok()) {
    throw new Error(
      `Create Expense failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedExpense>;

  if (!body.data) {
    throw new Error("Create Expense failed: response did not include data");
  }

  return body.data;
}

async function createReferenceData(
  api: APIRequestContext,
  type: string,
  data: { code: string; label: string; sortOrder: number },
): Promise<CreatedReferenceData> {
  const response = await api.post(e2eApiUrl(`/api/v1/reference-data/${type}`), {
    headers: authzHeaders(),
    data,
  });

  if (!response.ok()) {
    throw new Error(
      `Create reference data failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedReferenceData>;

  if (!body.data) {
    throw new Error(
      "Create reference data failed: response did not include data",
    );
  }

  return body.data;
}

async function createCompletePerson(
  api: APIRequestContext,
  input: {
    suffix: number;
    firstName: string;
    lastName: string;
    nickname: string;
  },
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

function completePersonPayload({
  suffix,
  firstName,
  lastName,
  nickname,
}: {
  suffix: number;
  firstName: string;
  lastName: string;
  nickname: string;
}) {
  const emailLocal = String(suffix).replace(/\D/g, "");

  return {
    firstName,
    lastName,
    nickname,
    cpf: validCPF(suffix),
    rg: validRG(suffix),
    cellular: validBrazilianCellular(suffix),
    email: `collaborator-e2e-${emailLocal}@example.com`,

    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",

    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-collaborator-e2e-${emailLocal}@example.com`,

    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-collaborator-e2e-${emailLocal}@example.com`,

    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright setup",
  };
}

function uniqueSuffix(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function firstPageSortLastName(seed: number): string {
  const reverseTimestamp = String(Number.MAX_SAFE_INTEGER - seed).padStart(
    16,
    "0",
  );

  return `!${reverseTimestamp}Pessoa`;
}

function validRG(seed: number): string {
  return `RG-E2E-${String(seed).slice(-8)}`;
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
