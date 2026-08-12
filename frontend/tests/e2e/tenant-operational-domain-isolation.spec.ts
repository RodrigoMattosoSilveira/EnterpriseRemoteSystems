import { expect, test, type APIRequestContext } from "@playwright/test";
import { authzHeaders, e2eApiUrl } from "./support/authz";

const DEFAULT_TENANT_ID = "default";
const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";
const PLANNING_AVAILABILITY_ACTIVE = "ACTIVE";

// Keep this audit in one test and use soft assertions so a single run reports
// every operational domain that still leaks records across tenant boundaries.
test("operational domain records created in default are hidden from another tenant", async ({
  request,
}) => {
  test.setTimeout(90_000);

  const suffix = uniqueSuffix();
  const workDate = uniqueDate(suffix);
  const defaultHeaders = authzHeaders(DEFAULT_TENANT_ID);

  const person = await postData<CreatedPerson>(
    request,
    "/api/v1/people",
    completePersonPayload(suffix),
    defaultHeaders,
    "create default-tenant Person",
  );
  expect(person.tenantId).toBe(DEFAULT_TENANT_ID);

  const collaborator = await postData<CreatedCollaborator>(
    request,
    "/api/v1/collaborators",
    {
      personId: person.id,
      journeyStartDate: workDate,
      paymentMethodId: PAYMENT_METHOD_DAILY_ID,
      paymentValue: 175.25,
      dailyBrlAmount: 175.25,
      planningAvailability: PLANNING_AVAILABILITY_ACTIVE,
      sectorId: SECTOR_MINING_ID,
      locationId: LOCATION_MAIN_MINE_ID,
      taskId: TASK_MINER_ID,
      statusId: COLLABORATOR_STATUS_ACTIVE_ID,
      notes: `Default-tenant isolation collaborator ${suffix}`,
    },
    defaultHeaders,
    "create default-tenant Collaborator",
  );
  expect(collaborator.tenantId).toBe(DEFAULT_TENANT_ID);

  const priceListItem = await postData<CreatedPriceListItem>(
    request,
    "/api/v1/price-list-items",
    {
      itemType: "CANTEEN",
      code: `TENANT_AUDIT_${suffix}`.slice(0, 40).toUpperCase(),
      description: `Default tenant audit item ${suffix}`,
      unitPriceBrl: 19.75,
      sortOrder: 9_999,
    },
    defaultHeaders,
    "create default-tenant Price List Item",
  );
  expect(priceListItem.tenantId).toBe(DEFAULT_TENANT_ID);

  const expense = await postData<CreatedExpense>(
    request,
    "/api/v1/expenses",
    {
      collaboratorId: collaborator.id,
      expenseDate: workDate,
      description: `Default tenant audit expense ${suffix}`,
      priceListItemId: priceListItem.id,
      currencyCode: "BRL",
      quantity: 1,
    },
    defaultHeaders,
    "create default-tenant Expense",
  );
  expect(expense.tenantId).toBe(DEFAULT_TENANT_ID);
  expect(expense.financialPosting?.receiptId).toBeTruthy();

  const workPeriod = await postData<CreatedWorkPeriod>(
    request,
    "/api/v1/work-periods",
    {
      workDate,
      periodCode: "DAY",
      name: `Default tenant audit period ${suffix}`,
      startsAt: `${workDate}T06:00:00Z`,
      endsAt: `${workDate}T18:00:00Z`,
    },
    defaultHeaders,
    "create default-tenant Work Period",
  );
  expect(workPeriod.tenantId).toBe(DEFAULT_TENANT_ID);

  const assignment = await postData<CreatedAssignment>(
    request,
    `/api/v1/work-periods/${encodeURIComponent(workPeriod.id)}/assignments`,
    {
      collaboratorId: collaborator.id,
      plannedStatus: "INCLUDED",
      planningAvailability: PLANNING_AVAILABILITY_ACTIVE,
      sectorId: SECTOR_MINING_ID,
      locationId: LOCATION_MAIN_MINE_ID,
      taskId: TASK_MINER_ID,
    },
    defaultHeaders,
    "create default-tenant Work Period Assignment",
  );
  expect(assignment.tenantId).toBe(DEFAULT_TENANT_ID);

  const goldProduction = await postData<CreatedGoldProductionEntry>(
    request,
    `/api/v1/work-periods/${encodeURIComponent(workPeriod.id)}/gold-production-entries`,
    {
      locationId: LOCATION_MAIN_MINE_ID,
      productionDate: workDate,
      goldGramsProduced: 77.125,
      notes: `Default tenant audit gold production ${suffix}`,
    },
    defaultHeaders,
    "create default-tenant Gold Production entry",
  );
  expect(goldProduction.tenantId).toBe(DEFAULT_TENANT_ID);

  const tenant = await postData<CreatedTenant>(
    request,
    "/api/v1/tenants",
    {
      code: `AUDIT${suffix}`.slice(0, 20).toUpperCase(),
      name: `Tenant isolation audit ${suffix}`,
      description: "Created by the operational tenant-isolation E2E test",
      active: true,
    },
    defaultHeaders,
    "create comparison tenant",
  );
  const selectedTenantHeaders = authzHeaders(tenant.id);

  try {
    await expectPagedListExcludes(
      request,
      `/api/v1/collaborators?search=${encodeURIComponent(person.nickname)}&page=1&pageSize=100`,
      selectedTenantHeaders,
      collaborator.id,
      tenant.id,
      "Collaborators",
    );

    await expectPagedListExcludes(
      request,
      `/api/v1/expenses?collaboratorId=${encodeURIComponent(collaborator.id)}&page=1&pageSize=100`,
      selectedTenantHeaders,
      expense.id,
      tenant.id,
      "Expenses",
    );

    await expectPagedListExcludes(
      request,
      `/api/v1/work-periods?dateFrom=${workDate}&dateTo=${workDate}&page=1&pageSize=100`,
      selectedTenantHeaders,
      workPeriod.id,
      tenant.id,
      "Work Periods",
    );

    await expectNestedResourceHidden(
      request,
      `/api/v1/work-periods/${encodeURIComponent(workPeriod.id)}/assignments?page=1&pageSize=100`,
      selectedTenantHeaders,
      assignment.id,
      tenant.id,
      "Work Period Assignments",
    );

    await expectNestedResourceHidden(
      request,
      `/api/v1/work-periods/${encodeURIComponent(
        workPeriod.id,
      )}/gold-production-entries?page=1&pageSize=100`,
      selectedTenantHeaders,
      goldProduction.id,
      tenant.id,
      "Gold Production entries",
    );

    await expectPagedListExcludes(
      request,
      `/api/v1/receipts/outstanding?collaborator=${encodeURIComponent(
        person.nickname,
      )}&sourceType=EXPENSE&page=1&pageSize=100`,
      selectedTenantHeaders,
      expense.financialPosting!.receiptId,
      undefined,
      "Outstanding Receipts",
    );

    await expectCrossTenantDetailHidden(
      request,
      `/api/v1/collaborators/${encodeURIComponent(collaborator.id)}`,
      selectedTenantHeaders,
      "Collaborator detail",
    );
    await expectCrossTenantDetailHidden(
      request,
      `/api/v1/expenses/${encodeURIComponent(expense.id)}`,
      selectedTenantHeaders,
      "Expense detail",
    );
    await expectCrossTenantDetailHidden(
      request,
      `/api/v1/work-periods/${encodeURIComponent(workPeriod.id)}`,
      selectedTenantHeaders,
      "Work Period detail",
    );
    await expectCrossTenantDetailHidden(
      request,
      `/api/v1/work-period-assignments/${encodeURIComponent(assignment.id)}`,
      selectedTenantHeaders,
      "Work Period Assignment detail",
    );
    await expectCrossTenantDetailHidden(
      request,
      `/api/v1/gold-production-entries/${encodeURIComponent(goldProduction.id)}`,
      selectedTenantHeaders,
      "Gold Production detail",
    );
    await expectCrossTenantDetailHidden(
      request,
      `/api/v1/collaborators/${encodeURIComponent(collaborator.id)}/current-account`,
      selectedTenantHeaders,
      "Current Account detail",
    );
  } finally {
    await bestEffortPatch(
      request,
      `/api/v1/gold-production-entries/${encodeURIComponent(goldProduction.id)}/deactivate`,
      defaultHeaders,
      {},
    );
    await bestEffortPatch(
      request,
      `/api/v1/work-period-assignments/${encodeURIComponent(assignment.id)}/deactivate`,
      defaultHeaders,
      {},
    );
    await bestEffortPatch(
      request,
      `/api/v1/expenses/${encodeURIComponent(expense.id)}/deactivate`,
      defaultHeaders,
      {},
    );
    await bestEffortPatch(
      request,
      `/api/v1/price-list-items/${encodeURIComponent(priceListItem.id)}/deactivate`,
      defaultHeaders,
      {},
    );
    await bestEffortPatch(
      request,
      `/api/v1/tenants/${encodeURIComponent(tenant.id)}/active`,
      defaultHeaders,
      { active: false },
    );
  }
});

type ApiEnvelope<T> = { data?: T; error?: unknown };

type TenantOwnedRecord = {
  id?: string;
  tenantId?: string;
};

type PagedResult<T> = {
  items?: T[];
  total?: number;
};

type CreatedPerson = {
  id: string;
  tenantId: string;
  nickname: string;
};

type CreatedCollaborator = {
  id: string;
  tenantId: string;
};

type CreatedPriceListItem = {
  id: string;
  tenantId: string;
};

type CreatedExpense = {
  id: string;
  tenantId: string;
  financialPosting?: {
    receiptId: string;
  };
};

type CreatedWorkPeriod = {
  id: string;
  tenantId: string;
};

type CreatedAssignment = {
  id: string;
  tenantId: string;
};

type CreatedGoldProductionEntry = {
  id: string;
  tenantId: string;
};

type CreatedTenant = {
  id: string;
};

async function postData<T>(
  request: APIRequestContext,
  path: string,
  data: unknown,
  headers: Record<string, string>,
  context: string,
): Promise<T> {
  const response = await request.post(e2eApiUrl(path), { headers, data });
  if (!response.ok()) {
    throw new Error(
      `${context} failed: HTTP ${response.status()} ${await response.text()}`,
    );
  }
  const body = (await response.json()) as ApiEnvelope<T>;
  if (!body.data) {
    throw new Error(`${context} failed: response did not include data`);
  }
  return body.data;
}

async function expectPagedListExcludes(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
  excludedID: string,
  expectedTenantID: string | undefined,
  context: string,
): Promise<void> {
  const response = await request.get(e2eApiUrl(path), { headers });
  expect.soft(response.status(), `${context} list should be readable`).toBe(200);
  if (response.status() !== 200) {
    return;
  }

  const body = (await response.json()) as ApiEnvelope<
    PagedResult<TenantOwnedRecord>
  >;
  const items = body.data?.items ?? [];
  expect.soft(
    items.some((item) => item.id === excludedID),
    `${context} leaked default-tenant record ${excludedID}`,
  ).toBeFalsy();
  if (expectedTenantID) {
    expect.soft(
      items.every((item) => item.tenantId === expectedTenantID),
      `${context} returned a record outside selected tenant ${expectedTenantID}`,
    ).toBeTruthy();
  }
}

async function expectNestedResourceHidden(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
  excludedID: string,
  expectedTenantID: string,
  context: string,
): Promise<void> {
  const response = await request.get(e2eApiUrl(path), { headers });
  if (response.status() === 404) {
    return;
  }

  expect
    .soft(response.status(), `${context} should return 404 or an empty list`)
    .toBe(200);
  if (response.status() !== 200) {
    return;
  }

  const body = (await response.json()) as ApiEnvelope<
    PagedResult<TenantOwnedRecord>
  >;
  const items = body.data?.items ?? [];
  expect.soft(
    items.some((item) => item.id === excludedID),
    `${context} leaked default-tenant record ${excludedID}`,
  ).toBeFalsy();
  expect.soft(
    items.every((item) => item.tenantId === expectedTenantID),
    `${context} returned a record outside selected tenant ${expectedTenantID}`,
  ).toBeTruthy();
}

async function expectCrossTenantDetailHidden(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
  context: string,
): Promise<void> {
  const response = await request.get(e2eApiUrl(path), { headers });
  expect.soft(
    response.status(),
    `${context} should not be readable from another tenant`,
  ).toBe(404);
}

async function bestEffortPatch(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
  data: unknown,
): Promise<void> {
  try {
    await request.patch(e2eApiUrl(path), { headers, data });
  } catch {
    // Cleanup must not hide the tenant-isolation assertions.
  }
}

function completePersonPayload(suffix: number) {
  const digits = String(suffix).replace(/\D/g, "");
  return {
    firstName: "Tenant",
    lastName: `Audit${suffix}`,
    nickname: `TenantAudit${suffix}`,
    cpf: validCPF(Number(digits.slice(-9))),
    rg: `RG-${digits.slice(-8).padStart(8, "0")}`,
    cellular: validBrazilianCellular(digits),
    email: `tenant-domain-audit-${digits}@example.com`,
    street1: "Rua Tenant Audit 100",
    street2: "Suite E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",
    bankName: "Banco Tenant Audit",
    bankNumber: "001",
    checkingAccount: `12345-${digits.slice(-1)}`,
    pixKey: `tenant-domain-audit-${digits}@example.com`,
    emergencyName: "Tenant Audit Contact",
    emergencyCellular: validBrazilianCellular(`${digits}1`),
    emergencyEmail: `tenant-domain-audit-emergency-${digits}@example.com`,
    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Created by the operational tenant-isolation E2E test",
  };
}

function uniqueSuffix(): number {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1_000)}`.slice(-14));
}

function uniqueDate(suffix: number): string {
  const digits = String(suffix).padStart(12, "0");
  const year = 3200 + (Number(digits.slice(-4)) % 5000);
  const month = 1 + (Number(digits.slice(-6, -4)) % 12);
  const day = 1 + (Number(digits.slice(-8, -6)) % 28);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(
    2,
    "0",
  )}-${String(day).padStart(2, "0")}`;
}

function validCPF(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);
  const first = cpfCheckDigit(digits);
  const second = cpfCheckDigit([...digits, first]);
  return `${base}${first}${second}`;
}

function cpfCheckDigit(numbers: number[]): number {
  const weightStart = numbers.length + 1;
  const sum = numbers.reduce(
    (total, digit, index) => total + digit * (weightStart - index),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function validBrazilianCellular(seed: string): string {
  const digits = seed.replace(/\D/g, "").padStart(8, "0").slice(-8);
  return `11${`9${digits}`.slice(0, 9)}`;
}
