import { expect, test, type APIRequestContext } from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const PAYMENT_METHOD_COMMISSION_ID = "ref-method-commission";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("posted BRL Work Period earnings are visible in Current Account with Work Period source link", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const workDate = e2eWorkDate(suffix);
  const workPeriodName = `E2E BRL earnings ${suffix}`;
  const personNickname = `EarnBrl${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `EarningBrl${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, {
    personId: person.id,
    journeyStartDate: workDate,
    paymentMethodId: PAYMENT_METHOD_DAILY_ID,
    paymentValue: 150.75,
    dailyBrlAmount: 150.75,
  });
  const workPeriod = await createWorkPeriod(request, {
    workDate,
    name: workPeriodName,
  });
  const assignment = await createAssignment(request, {
    workPeriodId: workPeriod.id,
    collaboratorId: collaborator.id,
  });
  await markAssignmentOutcome(request, assignment.id, "WORKED");

  await page.goto(`/work-periods/${workPeriod.id}`);
  await page.getByRole("button", { name: "Accrual" }).click();

  await page.getByLabel("Accrual notes").fill(`BRL E2E accrual ${suffix}`);
  const createRunResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/work-periods/${workPeriod.id}/accrual-runs`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run Accrual" }).click();
  await createRunResponse;

  await expect(page.getByText("150.75").first()).toBeVisible();
  await expect(page.getByText("READY", { exact: true }).first()).toBeVisible();

  const postRunResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/accrual-runs\/[^/]+\/post$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Post Ready Items" }).click();
  await postRunResponse;

  await expect(
    page.getByText("Posted items are now visible in Current Accounts."),
  ).toBeVisible();
  await expect(page.getByText("Posted earning credit").first()).toBeVisible();

  const detailAfterPost = await getCurrentAccount(request, collaborator.id, {
    sourceType: "WORK_PERIOD_ASSIGNMENT",
  });
  expect(detailAfterPost.ledgerEntries.total).toBe(1);
  expect(detailAfterPost.ledgerEntries.items[0]?.direction).toBe("CREDIT");
  expect(detailAfterPost.ledgerEntries.items[0]?.entryType).toBe("EARNING_CREDIT");
  expect(detailAfterPost.ledgerEntries.items[0]?.valueUnitCode).toBe("BRL");
  expect(detailAfterPost.ledgerEntries.items[0]?.sourceType).toBe(
    "WORK_PERIOD_ASSIGNMENT",
  );
  expect(detailAfterPost.ledgerEntries.items[0]?.sourceWorkPeriodId).toBe(
    workPeriod.id,
  );

  await page.getByRole("link", { name: "View in Current Account" }).click();

  await expect(page).toHaveURL(
    new RegExp(
      `/collaborators/${collaborator.id}/current-account\\?filter=earnings$`,
    ),
  );
  await expect(page.getByLabel("Filter ledger entries")).toHaveValue("earnings");
  await expect(page.getByText(/R\$\s*150,75/).first()).toBeVisible();
  await expect(
    page.getByText(`Work Period ${workDate} · ${workPeriodName}`).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Work Period" })).toHaveAttribute(
    "href",
    `/work-periods/${workPeriod.id}`,
  );

  await page.getByLabel("Filter ledger entries").selectOption("expenses");
  await expect(page.getByText("No ledger entries in this filter")).toBeVisible();
});

test("posted gold commission earnings are visible as gold-gram Current Account credits", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const workDate = e2eWorkDate(suffix + 1);
  const workPeriodName = `E2E gold earnings ${suffix}`;
  const personNickname = `EarnGold${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `EarningGold${suffix}`,
    nickname: personNickname,
  });
  const collaborator = await createCollaborator(request, {
    personId: person.id,
    journeyStartDate: workDate,
    paymentMethodId: PAYMENT_METHOD_COMMISSION_ID,
    paymentValue: 7.5,
    goldCommissionPercent: 7.5,
  });
  const workPeriod = await createWorkPeriod(request, {
    workDate,
    name: workPeriodName,
  });
  const assignment = await createAssignment(request, {
    workPeriodId: workPeriod.id,
    collaboratorId: collaborator.id,
  });
  await markAssignmentOutcome(request, assignment.id, "WORKED");

  await page.goto(`/work-periods/${workPeriod.id}`);
  await page.getByRole("button", { name: "Accrual" }).click();

  await page.getByLabel("Well / Location *").selectOption(LOCATION_MAIN_MINE_ID);
  await page.getByLabel("Gold produced (grams) *").fill("80");
  const productionResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/work-periods/${workPeriod.id}/gold-production-entries`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Add Production" }).click();
  await productionResponse;

  await expect(page.getByText("80.00000000 g")).toBeVisible();

  await page.getByLabel("Accrual notes").fill(`Gold E2E accrual ${suffix}`);
  const createRunResponse = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/v1/work-periods/${workPeriod.id}/accrual-runs`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Run Accrual" }).click();
  await createRunResponse;

  await expect(page.getByText("6.00000000 g").first()).toBeVisible();
  await expect(page.getByText("READY", { exact: true }).first()).toBeVisible();

  const postRunResponse = page.waitForResponse(
    (response) =>
      /\/api\/v1\/accrual-runs\/[^/]+\/post$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Post Ready Items" }).click();
  await postRunResponse;

  await page.getByRole("link", { name: "View in Current Account" }).click();

  await expect(page.getByLabel("Filter ledger entries")).toHaveValue("earnings");
  await expect(page.getByText("GOLD_GRAM").first()).toBeVisible();
  await expect(page.getByText("6 g gold").first()).toBeVisible();
  await expect(
    page.getByText(`Work Period ${workDate} · ${workPeriodName}`).first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Work Period" })).toHaveAttribute(
    "href",
    `/work-periods/${workPeriod.id}`,
  );

  const detailAfterPost = await getCurrentAccount(request, collaborator.id, {
    sourceType: "WORK_PERIOD_ASSIGNMENT",
  });
  expect(detailAfterPost.ledgerEntries.total).toBe(1);
  expect(detailAfterPost.ledgerEntries.items[0]?.direction).toBe("CREDIT");
  expect(detailAfterPost.ledgerEntries.items[0]?.entryType).toBe("EARNING_CREDIT");
  expect(detailAfterPost.ledgerEntries.items[0]?.valueUnitCode).toBe(
    "GOLD_GRAM",
  );
  expect(detailAfterPost.ledgerEntries.items[0]?.amount).toBe(6);
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
};

type CreatedCollaborator = {
  id: string;
};

type CreatedWorkPeriod = {
  id: string;
};

type CreatedAssignment = {
  id: string;
};

type CurrentAccountDetail = {
  ledgerEntries: {
    items: Array<{
      direction: string;
      entryType: string;
      valueUnitCode: string;
      amount: number;
      sourceType: string;
      sourceWorkPeriodId?: string;
    }>;
    total: number;
  };
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
  input: {
    personId: string;
    journeyStartDate: string;
    paymentMethodId: string;
    paymentValue: number;
    dailyBrlAmount?: number;
    goldCommissionPercent?: number;
  },
): Promise<CreatedCollaborator> {
  const response = await api.post(e2eApiUrl("/api/v1/collaborators"), {
    headers: authzHeaders(),
    data: {
      personId: input.personId,
      journeyStartDate: input.journeyStartDate,
      paymentMethodId: input.paymentMethodId,
      paymentValue: input.paymentValue,
      dailyBrlAmount: input.dailyBrlAmount,
      goldCommissionPercent: input.goldCommissionPercent,
      sectorId: SECTOR_MINING_ID,
      locationId: LOCATION_MAIN_MINE_ID,
      taskId: TASK_MINER_ID,
      statusId: COLLABORATOR_STATUS_ACTIVE_ID,
      notes: "Created by Playwright earnings setup",
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

async function createWorkPeriod(
  api: APIRequestContext,
  input: { workDate: string; name: string },
): Promise<CreatedWorkPeriod> {
  const response = await api.post(e2eApiUrl("/api/v1/work-periods"), {
    headers: authzHeaders(),
    data: {
      workDate: input.workDate,
      periodCode: "DAY",
      name: input.name,
      startsAt: `${input.workDate}T06:00:00Z`,
      endsAt: `${input.workDate}T18:00:00Z`,
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Create Work Period failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedWorkPeriod>;
  if (!body.data) {
    throw new Error("Create Work Period failed: response did not include data");
  }
  return body.data;
}

async function createAssignment(
  api: APIRequestContext,
  input: { workPeriodId: string; collaboratorId: string },
): Promise<CreatedAssignment> {
  const response = await api.post(
    e2eApiUrl(`/api/v1/work-periods/${input.workPeriodId}/assignments`),
    {
      headers: authzHeaders(),
      data: {
        collaboratorId: input.collaboratorId,
        plannedStatus: "INCLUDED",
        sectorId: SECTOR_MINING_ID,
        locationId: LOCATION_MAIN_MINE_ID,
        taskId: TASK_MINER_ID,
      },
    },
  );

  if (!response.ok()) {
    throw new Error(
      `Create Work Period assignment failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CreatedAssignment>;
  if (!body.data) {
    throw new Error(
      "Create Work Period assignment failed: response did not include data",
    );
  }
  return body.data;
}

async function markAssignmentOutcome(
  api: APIRequestContext,
  assignmentId: string,
  actualStatus: "WORKED",
) {
  const response = await api.patch(
    e2eApiUrl(`/api/v1/work-period-assignments/${assignmentId}/outcome`),
    {
      headers: authzHeaders(),
      data: { actualStatus },
    },
  );

  if (!response.ok()) {
    throw new Error(
      `Mark assignment outcome failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }
}

async function getCurrentAccount(
  api: APIRequestContext,
  collaboratorId: string,
  filter: { sourceType?: string } = {},
): Promise<CurrentAccountDetail> {
  const params = new URLSearchParams({ pageSize: "25" });
  if (filter.sourceType) params.set("sourceType", filter.sourceType);

  const response = await api.get(
    e2eApiUrl(
      `/api/v1/collaborators/${collaboratorId}/current-account?${params.toString()}`,
    ),
    { headers: authzHeaders() },
  );

  if (!response.ok()) {
    throw new Error(
      `Get Current Account failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<CurrentAccountDetail>;
  if (!body.data) {
    throw new Error("Get Current Account failed: response did not include data");
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
    lastName: firstPageSortLastName(suffix),
    nickname,
    cpf: validCPF(suffix),
    rg: validRG(suffix),
    cellular: validBrazilianCellular(suffix),
    email: `earnings-e2e-${emailLocal}@example.com`,

    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",

    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-earnings-e2e-${emailLocal}@example.com`,

    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-earnings-e2e-${emailLocal}@example.com`,

    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright earnings setup",
  };
}

function uniqueSuffix(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function e2eWorkDate(seed: number): string {
  const date = new Date(Date.UTC(2099, 0, 1));
  date.setUTCDate(date.getUTCDate() + (Math.abs(seed) % 2000));
  return date.toISOString().slice(0, 10);
}

function firstPageSortLastName(seed: number): string {
  const reverseTimestamp = String(Number.MAX_SAFE_INTEGER - seed).padStart(
    16,
    "0",
  );

  return `!${reverseTimestamp}Pessoa`;
}

function validRG(seed: number): string {
  return `RG-EARN-${String(seed).slice(-8)}`;
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
