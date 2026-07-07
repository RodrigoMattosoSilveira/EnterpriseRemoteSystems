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

test("planner can filter rows and save a temporary replacement without losing hidden absentee changes", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const workDate = e2eFarFutureWorkDate(suffix);
  const absentee = await createPlanningCollaborator(request, {
    suffix: suffix * 10 + 1,
    nickname: `E2EAbs${suffix}`,
    firstName: `Absentee${suffix}`,
    journeyStartDate: workDate,
  });
  const replacement = await createPlanningCollaborator(request, {
    suffix: suffix * 10 + 2,
    nickname: `E2ERep${suffix}`,
    firstName: `Replacement${suffix}`,
    journeyStartDate: workDate,
  });
  const workPeriod = await createWorkPeriod(request, {
    workDate,
    name: `E2E planning replacement ${suffix}`,
  });

  // Create one current-period snapshot before opening the page so this test
  // is isolated from any older same-period Work Periods in the local E2E DB.
  await bulkPlanAssignments(request, workPeriod.id, {
    rows: [
      planRow(absentee.id, {
        selected: false,
        planningAvailability: "ACTIVE",
        availabilityChanged: true,
      }),
    ],
  });

  await page.goto(`/work-periods/${workPeriod.id}`);
  await expect(
    page.getByRole("heading", { name: workPeriod.name }),
  ).toBeVisible();

  await page
    .getByLabel(`Availability for ${absentee.nickname}`)
    .selectOption("DAY_OFF");
  await page
    .getByLabel(`Replacement candidate for ${replacement.nickname}`)
    .check();
  await page
    .getByLabel(`Temporary replacement target for ${replacement.nickname}`)
    .selectOption(absentee.id);

  await page.getByLabel("Search collaborators").fill(replacement.nickname);

  await expect(page.getByText(/Showing 1 of \d+/)).toBeVisible();
  await expect(page.getByText(replacement.nickname).first()).toBeVisible();
  await expect(summaryMetric(page, "1 selected")).toBeVisible();
  await expect(summaryMetric(page, "1 candidate")).toBeVisible();
  await expect(summaryMetric(page, "1 temporary replacement")).toBeVisible();

  const saveResponse = page.waitForResponse(
    (response) =>
      response
        .url()
        .includes(`/api/v1/work-periods/${workPeriod.id}/assignments/bulk-plan`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: /Save plan/ }).click();
  const response = await saveResponse;
  expect(response.status()).toBe(200);

  const assignments = await listAssignments(request, workPeriod.id);
  const absenteeAssignment = assignmentFor(assignments, absentee.id);
  const replacementAssignment = assignmentFor(assignments, replacement.id);

  expect(absenteeAssignment.plannedStatus).toBe("EXCLUDED");
  expect(absenteeAssignment.planningAvailability).toBe("DAY_OFF");
  expect(replacementAssignment.plannedStatus).toBe("INCLUDED");
  expect(replacementAssignment.planningAvailability).toBe("ACTIVE");
  expect(replacementAssignment.replacementForAssignmentId).toBe(
    absenteeAssignment.id,
  );
});

test("new same-period plans carry forward the most recent temporary replacement", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const firstWorkDate = e2eFarFutureWorkDate(suffix + 1000);
  const secondWorkDate = addDays(firstWorkDate, 1);
  const absentee = await createPlanningCollaborator(request, {
    suffix: suffix * 10 + 3,
    nickname: `E2ECarryAbs${suffix}`,
    firstName: `CarryAbsentee${suffix}`,
    journeyStartDate: firstWorkDate,
  });
  const replacement = await createPlanningCollaborator(request, {
    suffix: suffix * 10 + 4,
    nickname: `E2ECarryRep${suffix}`,
    firstName: `CarryReplacement${suffix}`,
    journeyStartDate: firstWorkDate,
  });
  const sourcePeriod = await createWorkPeriod(request, {
    workDate: firstWorkDate,
    name: `E2E source plan ${suffix}`,
    periodCode: "NIGHT",
  });

  await bulkPlanAssignments(request, sourcePeriod.id, {
    rows: [
      planRow(absentee.id, {
        selected: false,
        planningAvailability: "DAY_OFF",
        availabilityChanged: true,
      }),
      planRow(replacement.id, {
        selected: true,
        temporaryReplacementForCollaboratorId: absentee.id,
      }),
    ],
  });

  const targetPeriod = await createWorkPeriod(request, {
    workDate: secondWorkDate,
    name: `E2E carried plan ${suffix}`,
    periodCode: "NIGHT",
  });

  await page.goto(`/work-periods/${targetPeriod.id}`);
  await expect(
    page.getByText(`Template source: ${sourcePeriod.workDate} · ${sourcePeriod.name}`),
  ).toBeVisible();
  await expect(
    page.getByLabel(`Replacement candidate for ${replacement.nickname}`),
  ).toBeChecked();
  await expect(
    page.getByLabel(`Temporary replacement target for ${replacement.nickname}`),
  ).toHaveValue(absentee.id);

  await expect(summaryMetric(page, "1 temporary replacement")).toBeVisible();

  // This test intentionally stops after proving the carried replacement is
  // visible in the new plan. Saving the new period is covered by the first
  // test; the carried relationship is only a planner default until the current
  // Work Period's absentee availability is deliberately refined.
});

test("bulk planning rejects two replacement collaborators for the same absentee", async ({
  request,
}) => {
  const suffix = uniqueSuffix();
  const workDate = e2eFarFutureWorkDate(suffix + 2000);
  const absentee = await createPlanningCollaborator(request, {
    suffix: suffix * 10 + 5,
    nickname: `E2EDupAbs${suffix}`,
    firstName: `DuplicateAbsentee${suffix}`,
    journeyStartDate: workDate,
  });
  const firstReplacement = await createPlanningCollaborator(request, {
    suffix: suffix * 10 + 6,
    nickname: `E2EDupRepA${suffix}`,
    firstName: `DuplicateReplacementA${suffix}`,
    journeyStartDate: workDate,
  });
  const secondReplacement = await createPlanningCollaborator(request, {
    suffix: suffix * 10 + 7,
    nickname: `E2EDupRepB${suffix}`,
    firstName: `DuplicateReplacementB${suffix}`,
    journeyStartDate: workDate,
  });
  const workPeriod = await createWorkPeriod(request, {
    workDate,
    name: `E2E duplicate replacement ${suffix}`,
  });

  const response = await request.post(
    e2eApiUrl(`/api/v1/work-periods/${workPeriod.id}/assignments/bulk-plan`),
    {
      headers: authzHeaders(),
      data: {
        rows: [
          planRow(absentee.id, {
            selected: false,
            planningAvailability: "LEAVE_OF_ABSENCE",
            availabilityChanged: true,
          }),
          planRow(firstReplacement.id, {
            selected: true,
            temporaryReplacementForCollaboratorId: absentee.id,
          }),
          planRow(secondReplacement.id, {
            selected: true,
            temporaryReplacementForCollaboratorId: absentee.id,
          }),
        ],
      },
    },
  );

  expect(response.status()).toBe(400);
  const body = (await response.json()) as ApiEnvelope<unknown>;
  expect(body.error?.code).toBe("validation_failed");
  expect(JSON.stringify(body.error?.fields ?? {})).toContain(
    "temporaryReplacementForCollaboratorId",
  );
});

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
};

type CreatedCollaborator = {
  id: string;
  nickname: string;
};

type CreatedPerson = {
  id: string;
};

type CreatedWorkPeriod = {
  id: string;
  workDate: string;
  name: string;
};

type WorkPeriodAssignment = {
  id: string;
  collaboratorId: string;
  plannedStatus: string;
  planningAvailability: string;
  replacementForAssignmentId?: string;
};

type AssignmentListResponse = {
  items: WorkPeriodAssignment[];
  total: number;
};

type BulkPlanInput = {
  rows: Array<{
    collaboratorId: string;
    selected: boolean;
    sectorId: string;
    locationId: string;
    taskId: string;
    planningAvailability: string;
    availabilityChanged?: boolean;
    temporaryReplacementForCollaboratorId?: string;
  }>;
};

async function createPlanningCollaborator(
  api: APIRequestContext,
  input: {
    suffix: number;
    nickname: string;
    firstName: string;
    journeyStartDate: string;
  },
): Promise<CreatedCollaborator> {
  const person = await createCompletePerson(api, input);
  const response = await api.post(e2eApiUrl("/api/v1/collaborators"), {
    headers: authzHeaders(),
    data: {
      personId: person.id,
      journeyStartDate: input.journeyStartDate,
      paymentMethodId: PAYMENT_METHOD_DAILY_ID,
      paymentValue: 125,
      dailyBrlAmount: 125,
      sectorId: SECTOR_MINING_ID,
      locationId: LOCATION_MAIN_MINE_ID,
      taskId: TASK_MINER_ID,
      statusId: COLLABORATOR_STATUS_ACTIVE_ID,
      notes: "Created by Playwright planning setup",
    },
  });

  if (!response.ok()) {
    throw new Error(
      `Create Collaborator failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<{ id: string }>;
  if (!body.data) {
    throw new Error("Create Collaborator failed: response did not include data");
  }

  return { id: body.data.id, nickname: input.nickname };
}

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

async function createWorkPeriod(
  api: APIRequestContext,
  input: { workDate: string; name: string; periodCode?: "DAY" | "NIGHT" },
): Promise<CreatedWorkPeriod> {
  const response = await api.post(e2eApiUrl("/api/v1/work-periods"), {
    headers: authzHeaders(),
    data: {
      workDate: input.workDate,
      periodCode: input.periodCode ?? "DAY",
      name: input.name,
      startsAt:
        input.periodCode === "NIGHT"
          ? `${input.workDate}T18:00:00Z`
          : `${input.workDate}T06:00:00Z`,
      endsAt:
        input.periodCode === "NIGHT"
          ? `${addDays(input.workDate, 1)}T06:00:00Z`
          : `${input.workDate}T18:00:00Z`,
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

async function bulkPlanAssignments(
  api: APIRequestContext,
  workPeriodId: string,
  input: BulkPlanInput,
): Promise<void> {
  const response = await api.post(
    e2eApiUrl(`/api/v1/work-periods/${workPeriodId}/assignments/bulk-plan`),
    {
      headers: authzHeaders(),
      data: input,
    },
  );

  if (!response.ok()) {
    throw new Error(
      `Bulk plan failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }
}

async function listAssignments(
  api: APIRequestContext,
  workPeriodId: string,
): Promise<WorkPeriodAssignment[]> {
  const response = await api.get(
    e2eApiUrl(`/api/v1/work-periods/${workPeriodId}/assignments?pageSize=200`),
    { headers: authzHeaders() },
  );

  if (!response.ok()) {
    throw new Error(
      `List assignments failed at ${response.url()}: ${response.status()} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as ApiEnvelope<AssignmentListResponse>;
  if (!body.data) {
    throw new Error("List assignments failed: response did not include data");
  }
  return body.data.items;
}

function assignmentFor(
  assignments: WorkPeriodAssignment[],
  collaboratorId: string,
): WorkPeriodAssignment {
  const assignment = assignments.find((row) => row.collaboratorId === collaboratorId);
  if (!assignment) {
    throw new Error(`Assignment for collaborator ${collaboratorId} was not found`);
  }
  return assignment;
}

function summaryMetric(page: Page, text: string) {
  return page
    .locator("span")
    .filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function planRow(
  collaboratorId: string,
  overrides: Partial<BulkPlanInput["rows"][number]> = {},
): BulkPlanInput["rows"][number] {
  return {
    collaboratorId,
    selected: true,
    sectorId: SECTOR_MINING_ID,
    locationId: LOCATION_MAIN_MINE_ID,
    taskId: TASK_MINER_ID,
    planningAvailability: "ACTIVE",
    ...overrides,
  };
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
    lastName: `Planning${emailLocal}`,
    nickname,
    cpf: validCPF(suffix),
    rg: validRG(suffix),
    cellular: validBrazilianCellular(suffix),
    email: `planning-e2e-${emailLocal}@example.com`,

    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",

    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-planning-e2e-${emailLocal}@example.com`,

    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 100),
    emergencyEmail: `emergency-planning-e2e-${emailLocal}@example.com`,

    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright planning setup",
  };
}

function uniqueSuffix(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function e2eFarFutureWorkDate(seed: number): string {
  const date = new Date(Date.UTC(2199, 0, 1));
  date.setUTCDate(date.getUTCDate() + (Math.abs(seed) % 2000));
  return date.toISOString().slice(0, 10);
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validRG(seed: number): string {
  return `RG-PLAN-${String(seed).slice(-8)}`;
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
