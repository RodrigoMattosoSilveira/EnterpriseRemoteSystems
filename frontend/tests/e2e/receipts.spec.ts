import { expect, test, type APIRequestContext } from "@playwright/test";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";
const EXPENSE_CATEGORY_CANTEEN_ID = "ref-expense-category-canteen";
const VALUE_UNIT_BRL_ID = "ref-value-unit-brl";
const ADMIN_ACTOR_ID = "bootstrap-admin";

test("outstanding receipt appears, can be opened, and disappears after signed return", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const description = `Receipt E2E debit ${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ReceiptE2E${suffix}`,
    nickname: `Receipt${suffix}`,
  });
  const collaborator = await createCollaborator(request, person.id);
  await createExpense(request, {
    collaboratorId: collaborator.id,
    expenseCategoryId: EXPENSE_CATEGORY_CANTEEN_ID,
    valueUnitId: VALUE_UNIT_BRL_ID,
    amount: 12.34,
    expenseDate: todayISODate(),
    description,
  });

  const ledgerEntry = await findLedgerEntryForDescription(
    request,
    collaborator.id,
    description,
  );
  const receipt = await findOutstandingReceiptByLedgerEntryId(
    request,
    ledgerEntry.id,
  );
  expect(receipt).toBeDefined();
  expect(receipt?.status).toBe("PENDING_ISSUE");

  await page.goto("/receipts/outstanding");
  await expect(
    page.getByRole("heading", { name: "Outstanding receipts" }),
  ).toBeVisible();

  await page.goto(`/ledger-entries/${ledgerEntry.id}/receipt`);
  await expect(page.getByRole("heading", { name: "Receipt", exact: true })).toBeVisible();
  await expect(page.getByText(receipt!.receiptNumber)).toBeVisible();
  await expect(page.getByText(description)).toBeVisible();

  await page.getByLabel("Received by").fill("receipt-e2e@example.com");
  await page
    .getByLabel("Signed document reference")
    .fill(`receipt-scan-${suffix}.pdf`);
  await page.getByLabel("Notes").fill("Returned by Playwright E2E test.");
  await page.getByRole("button", { name: "Record signed return" }).click();

  await expect(page.getByText("returned", { exact: true })).toBeVisible();
  await expect(page.getByText("receipt-scan-", { exact: false })).toBeVisible();

  const returnedReceipt = await getPrintableReceipt(request, ledgerEntry.id);
  expect(returnedReceipt.status).toBe("RETURNED");
  expect(returnedReceipt.receivedBy).toBe(ADMIN_ACTOR_ID);

  const refreshedReceipt = await findOutstandingReceiptByLedgerEntryId(
    request,
    ledgerEntry.id,
  );
  expect(refreshedReceipt).toBeUndefined();
});

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string; fields?: Record<string, string> };
};

type CreatedPerson = { id: string; firstName: string; lastName: string; nickname: string };
type CreatedCollaborator = { id: string };
type Expense = { id: string; description?: string };
type LedgerEntry = { id: string; description?: string; sourceId?: string };
type LedgerEntryListResult = { items: LedgerEntry[]; total: number };
type PrintableReceipt = {
  id: string;
  receiptNumber: string;
  status: string;
  ledgerEntryId: string;
  receivedBy?: string;
};
type OutstandingReceiptListResult = {
  items: PrintableReceipt[];
  total: number;
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
  if (!body.data) throw new Error("Create Person failed: response did not include data");
  return body.data;
}

async function createCollaborator(
  api: APIRequestContext,
  personId: string,
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
      statusId: COLLABORATOR_STATUS_ACTIVE_ID,
      notes: "Created by Playwright receipt setup",
    },
  });
  if (!response.ok()) {
    throw new Error(
      `Create Collaborator failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as ApiEnvelope<CreatedCollaborator>;
  if (!body.data) throw new Error("Create Collaborator failed: response did not include data");
  return body.data;
}

async function createExpense(api: APIRequestContext, payload: ExpensePayload): Promise<Expense> {
  const response = await api.post("/api/v1/expenses", { data: payload });
  if (!response.ok()) {
    throw new Error(
      `Create Expense failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as ApiEnvelope<Expense>;
  if (!body.data) throw new Error("Create Expense failed: response did not include data");
  return body.data;
}

async function findLedgerEntryForDescription(
  api: APIRequestContext,
  collaboratorId: string,
  description: string,
): Promise<LedgerEntry> {
  const response = await api.get(
    `/api/v1/current-accounts/${encodeURIComponent(collaboratorId)}/ledger-entries?pageSize=100`,
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as ApiEnvelope<LedgerEntryListResult>;
  const entry = body.data?.items.find((item) => item.description === description);
  if (!entry) throw new Error(`Could not find ledger entry for ${description}`);
  return entry;
}

async function listOutstandingReceipts(api: APIRequestContext, page = 1): Promise<OutstandingReceiptListResult> {
  const response = await api.get(`/api/v1/receipts/outstanding?pageSize=200&page=${page}`);
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as ApiEnvelope<OutstandingReceiptListResult>;
  if (!body.data) throw new Error("Outstanding receipts response did not include data");
  return body.data;
}

async function findOutstandingReceiptByLedgerEntryId(
  api: APIRequestContext,
  ledgerEntryId: string,
): Promise<PrintableReceipt | undefined> {
  let page = 1;
  let searched = 0;

  while (true) {
    const outstanding = await listOutstandingReceipts(api, page);
    const receipt = outstanding.items.find((item) => item.ledgerEntryId === ledgerEntryId);
    if (receipt) return receipt;

    searched += outstanding.items.length;
    if (searched >= outstanding.total || outstanding.items.length === 0) {
      return undefined;
    }
    page += 1;
  }
}

async function getPrintableReceipt(api: APIRequestContext, ledgerEntryId: string): Promise<PrintableReceipt> {
  const response = await api.get(
    `/api/v1/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt`,
  );
  expect(response.ok()).toBeTruthy();
  const body = (await response.json()) as ApiEnvelope<PrintableReceipt>;
  if (!body.data) throw new Error("Printable receipt response did not include data");
  return body.data;
}

function completePersonPayload({ suffix, firstName, nickname }: { suffix: number; firstName: string; nickname: string }) {
  const emailLocal = String(suffix).replace(/\D/g, "");
  return {
    firstName,
    lastName: "Pessoa",
    nickname,
    cpf: validCPF(suffix),
    rg: validRG(suffix),
    cellular: validBrazilianCellular(suffix),
    email: `receipt-e2e-${emailLocal}@example.com`,
    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",
    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-receipt-e2e-${emailLocal}@example.com`,
    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-receipt-e2e-${emailLocal}@example.com`,
    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright receipt setup",
  };
}

function uniqueSuffix(): number { return Date.now() + Math.floor(Math.random() * 1000); }
function todayISODate() { return new Date().toISOString().slice(0, 10); }
function validRG(seed: number): string { return `RG-RCP-${String(seed).slice(-8)}`; }
function validBrazilianCellular(seed: number): string {
  const uniqueDigits = String(seed).replace(/\D/g, "").padStart(8, "0").slice(-8);
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
  const sum = numbers.reduce((acc, digit, index) => acc + digit * (weightStart - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
