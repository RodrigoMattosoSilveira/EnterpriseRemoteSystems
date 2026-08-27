import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { uniquePersonSuffix } from "./support/test-data";
import {
  E2E_ACTOR_ID,
  authzHeaders,
  e2eApiUrl,
  seedBrowserAuthz,
} from "./support/authz";

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";

const REQUIRED_REASON_CODE = "COLLABORATOR_REQUESTED_PAYOUT";
const REQUIRED_REASON_TEXT = "Collaborator requested a reviewed partial payout.";
const SECOND_APPROVAL_NOTES = "Reviewed and approved by the second operator.";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("partial payout requires and submits a different second approver when tenant policy is enabled", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const secondApprover = await createTenantAuthorizedSecondApprover(request, {
    actorKey: `second-approver-e2e-${suffix}@example.com`,
    displayName: `Second Approver E2E ${suffix}`,
  });
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `ApprovalE2E${suffix}`,
    nickname: `Approval${suffix}`,
  });
  const collaborator = await createCollaborator(request, person.id);
  let capturedPayoutPayload: PartialPayoutPayload | undefined;

  await page.route("**/api/v1/collaborators/**/payout", async (route) => {
    capturedPayoutPayload = route.request().postDataJSON() as PartialPayoutPayload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          settlement: {
            id: `settlement-e2e-${suffix}`,
            collaboratorId: collaborator.id,
            settlementType: "PAYOUT",
            requestId: capturedPayoutPayload.requestId,
            status: "POSTED",
            effectiveDate: capturedPayoutPayload.effectiveDate,
            brlAmount: capturedPayoutPayload.brlAmount,
            goldGramAmount: capturedPayoutPayload.goldGramAmount,
            notes: capturedPayoutPayload.notes ?? "",
            authorizedBy: E2E_ACTOR_ID,
            authorizedAt: new Date().toISOString(),
          },
          ledgerEntries: [
            {
              id: `ledger-e2e-${suffix}`,
              entryType: "PAYOUT",
              direction: "DEBIT",
              valueUnitCode: "GOLD_GRAM",
              amount: capturedPayoutPayload.goldGramAmount,
              effectiveDate: capturedPayoutPayload.effectiveDate,
            },
          ],
        },
      }),
    });
  });

  await mockSecondPersonApprovalPolicy(page, true);

  await page.goto(`/collaborators/${collaborator.id}`);

    await expect(
      page.getByRole("heading", { name: person.nickname, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Journey Settlement", exact: true }),
    ).toBeVisible();

    await openPartialPayout(page);

    await expect(page.getByText("Second-person approval required")).toBeVisible();
    await expect(page.getByText(`Primary actor: ${E2E_ACTOR_ID}`)).toBeVisible();

    const secondApproverSelect = page.getByLabel("Second approver");
    await expect(secondApproverSelect).toBeEnabled();
    await expect(secondApproverSelect).toContainText(secondApprover.actorKey);

    const secondApproverOptions = await secondApproverSelect
      .locator("option")
      .allTextContents();
    expect(secondApproverOptions.join("\n")).toContain(secondApprover.actorKey);
    expect(secondApproverOptions.join("\n")).not.toContain(E2E_ACTOR_ID);

    await page.getByLabel("Gold grams").fill("0.01");
    await page.getByLabel("Reason code").selectOption(REQUIRED_REASON_CODE);
    await page.getByLabel("Reason text").fill(REQUIRED_REASON_TEXT);
    await page.getByRole("button", { name: "Confirm reauthentication", exact: true }).click();

    await expect(
      page.getByRole("button", { name: "Select second approver first" }),
    ).toBeDisabled();

    await secondApproverSelect.selectOption(secondApprover.actorKey);
    await page.getByLabel("Second approval notes").fill(SECOND_APPROVAL_NOTES);

    const submitButton = page.getByRole("button", { name: "Post Payout" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expect(page.getByRole("status")).toContainText(
      "Partial payout posted successfully.",
    );

    expect(capturedPayoutPayload).toBeDefined();
    expect(capturedPayoutPayload?.reasonCode).toBe(REQUIRED_REASON_CODE);
    expect(capturedPayoutPayload?.reasonText).toBe(REQUIRED_REASON_TEXT);
    expect(capturedPayoutPayload?.goldGramAmount).toBe(0.01);
    expect(capturedPayoutPayload?.secondApproval).toEqual({
      approvedBy: secondApprover.actorKey,
      notes: SECOND_APPROVAL_NOTES,
    });
});

test("partial payout can optionally record second approval when tenant policy is disabled", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const secondApprover = await createTenantAuthorizedSecondApprover(request, {
    actorKey: `optional-approver-e2e-${suffix}@example.com`,
    displayName: `Optional Approver E2E ${suffix}`,
  });
  const personSuffix = uniqueSuffix();
  const person = await createCompletePerson(request, {
    suffix: personSuffix,
    firstName: `OptionalApprovalE2E${suffix}`,
    nickname: `OptionalApproval${suffix}`,
  });
  const collaborator = await createCollaborator(request, person.id);
  let capturedPayoutPayload: PartialPayoutPayload | undefined;

  await page.route("**/api/v1/collaborators/**/payout", async (route) => {
    capturedPayoutPayload = route.request().postDataJSON() as PartialPayoutPayload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
          settlement: {
            id: `optional-settlement-e2e-${suffix}`,
            collaboratorId: collaborator.id,
            settlementType: "PAYOUT",
            requestId: capturedPayoutPayload.requestId,
            status: "POSTED",
            effectiveDate: capturedPayoutPayload.effectiveDate,
            brlAmount: capturedPayoutPayload.brlAmount,
            goldGramAmount: capturedPayoutPayload.goldGramAmount,
            notes: capturedPayoutPayload.notes ?? "",
            authorizedBy: E2E_ACTOR_ID,
            authorizedAt: new Date().toISOString(),
          },
          ledgerEntries: [
            {
              id: `optional-ledger-e2e-${suffix}`,
              entryType: "PAYOUT",
              direction: "DEBIT",
              valueUnitCode: "BRL",
              amount: capturedPayoutPayload.brlAmount,
              effectiveDate: capturedPayoutPayload.effectiveDate,
            },
          ],
        },
      }),
    });
  });

  await mockSecondPersonApprovalPolicy(page, false);

  await page.goto(`/collaborators/${collaborator.id}`);
    await openPartialPayout(page);

    await expect(page.getByText("Second-person approval optional")).toBeVisible();
    await expect(page.getByLabel("Second approver")).toHaveCount(0);

    await page.getByLabel("Record approval").check();
    const secondApproverSelect = page.getByLabel("Second approver");
    await expect(secondApproverSelect).toBeEnabled();
    await secondApproverSelect.selectOption(secondApprover.actorKey);

    await page.getByLabel("BRL amount").fill("1.23");
    await page.getByLabel("Reason code").selectOption(REQUIRED_REASON_CODE);
    await page
      .getByLabel("Reason text")
      .fill("Optional second approval was captured for this payout.");
    await page.getByRole("button", { name: "Confirm reauthentication", exact: true }).click();
    await page.getByRole("button", { name: "Post Payout" }).click();

    await expect(page.getByRole("status")).toContainText(
      "Partial payout posted successfully.",
    );

    expect(capturedPayoutPayload?.secondApproval).toEqual({
      approvedBy: secondApprover.actorKey,
    });
    expect(capturedPayoutPayload?.brlAmount).toBe(1.23);
});

type ApiEnvelope<T> = {
  data?: T;
  error?: { message?: string; fields?: Record<string, string> };
};

type CreatedPerson = { id: string; firstName: string; lastName: string; nickname: string };
type CreatedCollaborator = { id: string };
type AuthzActor = { id: string; actorKey: string; displayName: string; active: boolean };
type PartialPayoutPayload = {
  requestId: string;
  effectiveDate: string;
  brlAmount: number;
  goldGramAmount: number;
  reasonCode: string;
  reasonText: string;
  notes?: string;
  secondApproval?: { approvedBy: string; notes?: string };
};

async function openPartialPayout(page: Page): Promise<void> {
  const otherPayoutActions = page.locator("summary").filter({
    hasText: "Other payout actions",
  });
  await expect(otherPayoutActions).toBeVisible();
  await otherPayoutActions.click();
  await page.getByRole("button", { name: "Partial Payout" }).click();
}

async function mockSecondPersonApprovalPolicy(page: Page, required: boolean): Promise<void> {
  await page.route(
    "**/api/v1/current-accounts/settings/second-person-approval",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { required } }),
      });
    },
  );
}

async function createTenantAuthorizedSecondApprover(
  api: APIRequestContext,
  input: { actorKey: string; displayName: string },
): Promise<AuthzActor> {
  // Bite 30D's tenant actor directory intentionally exposes only Actors with
  // active tenant-scoped delegated authority. Provision the second approver as
  // a real tenant identity (Person/Membership -> Actor -> Account -> Role Grant)
  // instead of relying on the pre-30D behavior where a bare Actor appeared in
  // the application-global authorization catalog.
  const identitySuffix = uniqueSuffix();
  const person = await createCompletePerson(api, {
    suffix: identitySuffix,
    firstName: `SecondApprover${identitySuffix}`,
    nickname: `SecondApprover${identitySuffix}`,
  });

  const actorResponse = await api.post(e2eApiUrl("/api/v1/authz/actors"), {
    headers: authzHeaders(),
    data: {
      actorKey: input.actorKey,
      displayName: input.displayName,
      personId: person.id,
      active: true,
    },
  });
  if (!actorResponse.ok()) {
    throw new Error(
      `Create second-approver actor failed at ${actorResponse.url()}: ${actorResponse.status()} ${await actorResponse.text()}`,
    );
  }
  const actorBody = (await actorResponse.json()) as ApiEnvelope<AuthzActor>;
  if (!actorBody.data) {
    throw new Error("Create second-approver actor response did not include data");
  }
  const actor = actorBody.data;

  const accountResponse = await api.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: authzHeaders(),
    data: {
      actorId: actor.id,
      login: input.actorKey,
      temporaryPassword: `Second-Approver-${identitySuffix}-Password!`,
      mustChangePassword: false,
    },
  });
  if (accountResponse.status() !== 201) {
    throw new Error(
      `Create second-approver account failed at ${accountResponse.url()}: ${accountResponse.status()} ${await accountResponse.text()}`,
    );
  }

  const grantResponse = await api.post(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actor.id)}/role-grants`),
    {
      headers: authzHeaders(),
      data: { roleCode: "TENANT_ADMIN", tenantId: "default" },
    },
  );
  if (grantResponse.status() !== 201) {
    throw new Error(
      `Grant second-approver tenant role failed at ${grantResponse.url()}: ${grantResponse.status()} ${await grantResponse.text()}`,
    );
  }

  return actor;
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
  if (!body.data) throw new Error("Create Person failed: response did not include data");
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
      notes: "Created by Playwright second-person approval setup",
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
    email: `second-approval-e2e-${emailLocal}@example.com`,
    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",
    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-second-approval-e2e-${emailLocal}@example.com`,
    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-second-approval-e2e-${emailLocal}@example.com`,
    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright second-person approval setup",
  };
}

function uniqueSuffix(): number {
  return uniquePersonSuffix(test.info().workerIndex);
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function validRG(seed: number): string {
  return `RG-SPA-${String(seed).slice(-8)}`;
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
