import { expect, test, type APIRequestContext } from "@playwright/test";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";
const EXPENSE_CATEGORY_CANTEEN_ID = "ref-expense-category-canteen";
const VALUE_UNIT_BRL_ID = "ref-value-unit-brl";

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

  await expect(page.getByRole("heading", { name: "New Expense" })).toBeVisible();

  await expect(page.getByLabel("Collaborator *")).toContainText(personNickname);
  await page.getByLabel("Collaborator *").selectOption(collaborator.id);
  await page.getByLabel("Expense Category *").selectOption(EXPENSE_CATEGORY_CANTEEN_ID);
  await page.getByLabel("Value Unit *").selectOption(VALUE_UNIT_BRL_ID);
  await page.getByLabel("Amount *").fill(EXPENSE_AMOUNT);
  await page.getByLabel("Description").fill("Created by Playwright expense flow");

  await page.getByRole("button", { name: "Create Expense" }).click();

  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByRole("status")).toContainText(
    `Expense created for ${personNickname}.`,
  );
  await expect(page.getByRole("heading", { name: "Expenses" })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(personNickname) })).toBeVisible();
  await expect(page.getByText("Canteen").first()).toBeVisible();
  await expect(page.getByText("Created by Playwright expense flow").first()).toBeVisible();
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
  const sum = numbers.reduce(
    (acc, digit, index) => acc + digit * (weightStart - index),
    0,
  );
  const remainder = sum % 11;

  return remainder < 2 ? 0 : 11 - remainder;
}
