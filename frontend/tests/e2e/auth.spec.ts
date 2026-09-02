import { expect, test, type APIRequestContext } from "@playwright/test";
import { uniquePersonSuffix } from "./support/test-data";
import { E2E_ACTOR_ID, authzHeaders, e2eApiUrl, seedBrowserApplicationAdmin } from "./support/authz";
import { applicationAdminStorageStatePath } from "./support/storage";

test.use({ storageState: applicationAdminStorageStatePath });

test.beforeEach(async ({ page }) => {
  await seedBrowserApplicationAdmin(page);
});

test("admin can create an authorization actor, grant a role, and revoke it", async ({
  page,
  request,
}) => {
  const suffix = uniqueSuffix();
  const actorNickname = `AuthzE2E${suffix}`;
  const person = await createCompletePerson(request, {
    suffix,
    firstName: `Authz${suffix}`,
    nickname: actorNickname,
  });
  const collaborator = await createCollaborator(request, person.id);
  const actorKey = `collaborator-${collaborator.id}`;
  const displayName = actorNickname;
  // This test exercises generic tenant Role Grant UX. Keep it independent of
  // Bite 30H Tenant Administrator slot cardinality, which has dedicated coverage.
  const grantedRole = "EXPENSE_OPERATOR";
  const grantTenant = "default";
  const accountLogin = `authz-bound-${suffix}@example.com`;

  await page.goto("/admin/authorization");

  await expect(
    page.getByRole("heading", { name: "Application Authorization", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Authenticated authorization context" }),
  ).toBeVisible();
  await expect(page.getByLabel("Selected Tenant ID")).toHaveValue("*");
  await expect(page.getByText("Authenticated actor verified")).toBeVisible();

  await expect(
    page.getByRole("heading", { name: "Actors", exact: true }),
  ).toBeVisible();
  const rolesSection = page.getByTestId("authz-roles-section");
  const permissionsSection = page.getByTestId("authz-permissions-section");

  await expect(rolesSection).toBeVisible();
  await expect(
    rolesSection.getByRole("heading", { name: "APPLICATION_ADMIN", exact: true }),
  ).toBeVisible();
  await expect(permissionsSection).toBeVisible();
  await expect(permissionsSection.getByText("authz.manage").first()).toBeVisible();

  const collaboratorSearch = page.getByLabel(
    "Find collaborator by person nickname",
  );
  await collaboratorSearch.fill(actorNickname.slice(2));

  const collaboratorSuggestions = page.getByRole("listbox", {
    name: "Matching collaborators for actor creation",
  });
  const collaboratorOption = collaboratorSuggestions.getByRole("option", {
    name: new RegExp(actorNickname),
  });
  await expect(collaboratorOption).toBeVisible();
  await collaboratorOption.click();

  await expect(collaboratorSearch).toHaveValue("");
  await expect(collaboratorSuggestions).toHaveCount(0);
  await expect(page.getByText(`Actor key: ${actorKey}`)).toBeVisible();
  await expect(page.getByText(`Display name: ${displayName}`)).toBeVisible();

  await page.getByRole("button", { name: "Create Actor" }).click();

  await expect(page.getByRole("status")).toContainText(`${actorKey} created.`);

  const actorCard = page
    .getByTestId("authz-actor-card")
    .filter({
      has: page.getByRole("heading", { name: actorKey, exact: true }),
    });

  await expect(actorCard).toBeVisible();
  await expect(actorCard).toContainText(displayName);
  await expect(actorCard).toContainText("No role grants.");

  // Bite 30D requires a tenant Actor to be Account/Membership-bound before a
  // delegated tenant Role can be granted. Resolve the Actor created by the UI,
  // bind it to an Authentication Account, then exercise grant/revoke.
  const actorsResponse = await request.get(e2eApiUrl("/api/v1/authz/actors"), {
    headers: authzHeaders(),
  });
  expect(actorsResponse.ok()).toBeTruthy();
  const actorsEnvelope = (await actorsResponse.json()) as {
    data?: Array<{ id?: string; actorKey?: string }>;
  };
  const createdActorId = (actorsEnvelope.data ?? []).find(
    (actor) => actor.actorKey === actorKey,
  )?.id;
  expect(createdActorId).toBeTruthy();

  const accountResponse = await request.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: authzHeaders(),
    data: {
      actorId: createdActorId,
      login: accountLogin,
      temporaryPassword: `Authz-Bound-${suffix}-Password!`,
      mustChangePassword: false,
    },
  });
  expect(accountResponse.status()).toBe(201);

  // Account creation changes the authoritative Account -> Actor binding outside
  // this page's React Query cache. Reload so the Application Authorization UI
  // receives the real TENANT binding and derives the grant target from it.
  await page.reload();
  await expect(actorCard).toContainText(
    `Authentication Account: Bound · ${accountLogin}`,
  );
  await expect(actorCard).toContainText(
    "Authentication binding: TENANT · default",
  );
  await expect(actorCard).toContainText(
    "Person–Tenant Membership: ACTIVE · same tenant",
  );
  await expect(actorCard).toContainText("Tenant Role Grants: ELIGIBLE");
  await expect(
    actorCard.getByLabel("Role").locator('option[value="APPLICATION_ADMIN"]'),
  ).toHaveCount(0);

  const eligibilityFilter = page.getByLabel("Tenant Role Grant eligibility");
  await expect(eligibilityFilter).toHaveValue("ALL");
  await eligibilityFilter.selectOption("ELIGIBLE");
  await expect(actorCard).toBeVisible();
  await expect(
    page
      .getByTestId("authz-actor-card")
      .filter({
        has: page.getByRole("heading", {
          name: E2E_ACTOR_ID,
          exact: true,
        }),
      }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(eligibilityFilter).toHaveValue("ALL");

  const actorNicknameFilter = page.getByLabel(
    "Filter actors by Actor Key or person nickname",
  );
  const initialNicknameFilterBox = await actorNicknameFilter.boundingBox();
  expect(initialNicknameFilterBox?.width ?? 0).toBeGreaterThanOrEqual(320);

  await actorNicknameFilter.fill(actorNickname.slice(2));
  const filteredNicknameFilterBox = await actorNicknameFilter.boundingBox();
  expect(filteredNicknameFilterBox?.width ?? 0).toBeGreaterThanOrEqual(320);
  await expect(actorCard).toBeVisible();
  await expect(
    page
      .getByTestId("authz-actor-card")
      .filter({
        has: page.getByRole("heading", {
          name: E2E_ACTOR_ID,
          exact: true,
        }),
      }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(
    page
      .getByTestId("authz-actor-card")
      .filter({
        has: page.getByRole("heading", {
          name: E2E_ACTOR_ID,
          exact: true,
        }),
      }),
  ).toBeVisible();

  await actorCard.getByLabel("Role").selectOption(grantedRole);
  await expect(actorCard.getByLabel("Grant tenant")).toHaveValue(grantTenant);
  await expect(actorCard.getByLabel("Grant tenant")).toBeDisabled();
  await actorCard.getByRole("button", { name: "Grant Role" }).click();

  await expect(page.getByRole("status")).toContainText(
    `${grantedRole} granted.`,
  );
  await expect(actorCard).toContainText(`${grantedRole} · ${grantTenant}`);
  await expect(actorCard.getByLabel("Role")).toHaveValue(grantedRole);
  await expect(actorCard.getByLabel("Grant tenant")).toHaveValue(grantTenant);
  await expect(actorCard.getByRole("button", { name: "Grant Role" })).toBeDisabled();

  // The grant state must survive a full route/page remount. A persisted tenant
  // grant is the authoritative fallback for the Actor card; it must not return
  // to APPLICATION_ADMIN / * merely because local select state was discarded.
  await page.reload();
  await expect(actorCard).toContainText(`${grantedRole} · ${grantTenant}`);
  await expect(actorCard.getByLabel("Role")).toHaveValue(grantedRole);
  await expect(actorCard.getByLabel("Grant tenant")).toHaveValue(grantTenant);
  await expect(actorCard.getByRole("button", { name: "Grant Role" })).toBeDisabled();

  await actorCard.getByRole("button", { name: "Revoke" }).click();

  await expect(page.getByRole("status")).toContainText(
    `${grantedRole} revoked.`,
  );
  await expect(
    actorCard.getByText(`${grantedRole} · ${grantTenant}`),
  ).toHaveCount(0);
  await expect(actorCard).toContainText("No role grants.");
});

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";

type ApiEnvelope<T> = {
  data?: T;
};

type CreatedPerson = {
  id: string;
};

type CreatedCollaborator = {
  id: string;
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
      notes: "Created by Playwright authorization actor setup",
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
    email: `authz-e2e-${emailLocal}@example.com`,
    street1: "Rua Playwright 123",
    street2: "Apto E2E",
    city: "Sao Paulo",
    state: "SP",
    cep: "01001000",
    country: "Brasil",
    bankName: "Banco E2E",
    bankNumber: "001",
    checkingAccount: `12345-${String(suffix).slice(-1)}`,
    pixKey: `pix-authz-e2e-${emailLocal}@example.com`,
    emergencyName: "Contato Emergencia",
    emergencyCellular: validBrazilianCellular(suffix + 1),
    emergencyEmail: `emergency-authz-e2e-${emailLocal}@example.com`,
    statusId: PERSON_STATUS_ACTIVE_ID,
    notes: "Complete Person created by Playwright authorization setup",
  };
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function validRG(seed: number): string {
  return `RG-AUTHZ-${String(seed).slice(-8)}`;
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

function uniqueSuffix(): number {
  return uniquePersonSuffix(test.info().workerIndex);
}
