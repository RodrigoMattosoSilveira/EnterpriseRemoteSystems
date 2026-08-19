import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";
import { authzHeaders, e2eApiUrl } from "./support/authz";

type ApiEnvelope<T> = {
  data?: T;
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string>;
  };
};

type AuthzActorRoleGrant = {
  id: string;
  actorId: string;
  roleCode: string;
  tenantId: string;
  active: boolean;
};

type AuthzActor = {
  id: string;
  actorKey: string;
  displayName: string;
  active: boolean;
  roleGrants?: AuthzActorRoleGrant[];
};

type AuthzCurrentActor = {
  actorKey: string;
  actorRecordId: string;
  tenantId: string;
  scope: string;
  roleCodes: string[];
  permissions: string[];
  intrinsicPermissions?: string[];
  delegatedPermissions?: string[];
};

type ProvisionedAuthzActor = AuthzActor & {
  login: string;
  temporaryPassword: string;
};

type AuthAccount = {
  actors: Array<{
    actorId: string;
    actorKey: string;
    displayName: string;
    tenantId?: string;
    active: boolean;
  }>;
};

type RoleCode =
  | "APPLICATION_ADMIN"
  | "TENANT_ADMIN"
  | "EARNINGS_OPERATOR"
  | "EXPENSE_OPERATOR";

const DEFAULT_TENANT_ID = "default";

test.describe("authorization role boundaries", () => {
  test("unknown actors cannot gain permissions through X-Actor-Permissions", async () => {
    const api = await newIsolatedApi();
    try {
      const actorKey = `missing-authz-e2e-${uniqueSuffix()}@example.com`;
      const forgedHeaders = {
        ...actorHeaders(actorKey),
        "X-Actor-Permissions": "*",
      };

      const currentActorResponse = await api.get(
        e2eApiUrl("/api/v1/authz/current-actor"),
        { headers: forgedHeaders },
      );
      await expectStatus(
        currentActorResponse,
        401,
        "unknown actor current-actor lookup should be rejected",
      );
      await expectErrorCode(currentActorResponse, "authentication_required");

      const authzAdminResponse = await api.get(e2eApiUrl("/api/v1/authz/actors"), {
        headers: forgedHeaders,
      });
      await expectStatus(
        authzAdminResponse,
        401,
        "unknown actor must not become an authorization administrator",
      );
      await expectErrorCode(authzAdminResponse, "authentication_required");
    } finally {
      await api.dispose();
    }
  });

  test("expense operators can perform expense work but cannot administer authorization or settings", async ({
    request: adminApi,
  }) => {
    let actorApi: APIRequestContext | undefined;
    try {
      const actor = await createActorWithRole(adminApi, "expense", "EXPENSE_OPERATOR");
      actorApi = await createActorAccountAndLogin(adminApi, actor);
      const headers = tenantHeaders();

      const currentActor = await getCurrentActor(actorApi, headers);
      expect(currentActor.actorKey).toBe(actor.actorKey);
      expect(currentActor.tenantId).toBe(DEFAULT_TENANT_ID);
      expect(currentActor.roleCodes).toContain("EXPENSE_OPERATOR");
      expect(currentActor.permissions).toContain("people.self.read");
      expect(currentActor.intrinsicPermissions).toContain("people.self.read");
      expect(currentActor.delegatedPermissions).toContain("expenses.create");
      expect(currentActor.permissions).toContain("expenses.create");
      expect(currentActor.permissions).toContain("ledger.receipts.print");
      expect(currentActor.permissions).not.toContain("authz.manage");
      expect(currentActor.delegatedPermissions).not.toContain("gold_prices.manage");
      expect(currentActor.delegatedPermissions).not.toContain("gold_production.manage");

      await expectStatus(
        await actorApi.get(e2eApiUrl("/api/v1/reference-data/sector"), { headers }),
        200,
        "expense operators should read reference data needed by expense forms",
      );

      await expectStatus(
        await actorApi.post(e2eApiUrl("/api/v1/expenses"), {
          headers,
          data: {},
        }),
        400,
        "expense operators should reach expense creation validation",
      );

      await expectStatus(
        await actorApi.post(e2eApiUrl("/api/v1/reference-data/task"), {
          headers,
          data: {
            code: `FORBIDDEN_${uniqueSuffix()}`,
            label: "Expense Operator Must Not Manage Reference Data",
            active: true,
            sortOrder: 9999,
          },
        }),
        403,
        "expense operators may read operational reference data but must not manage it",
      );

      await expectStatus(
        await actorApi.get(e2eApiUrl("/api/v1/gold-prices"), { headers }),
        403,
        "expense operators must not browse sensitive gold-price administration history",
      );

      await expectStatus(
        await actorApi.post(e2eApiUrl("/api/v1/gold-prices"), {
          headers,
          data: {
            priceDate: "2026-08-18",
            brlPerGram: 500,
            recordedBy: actor.actorKey,
          },
        }),
        403,
        "expense operators must not record sensitive tenant gold prices",
      );


      await expectStatus(
        await actorApi.get(e2eApiUrl("/api/v1/authz/actors"), { headers }),
        403,
        "expense operators must not administer authorization actors",
      );

      await expectStatus(
        await actorApi.put(
          e2eApiUrl("/api/v1/current-accounts/settings/second-person-approval"),
          {
            headers,
            data: { required: false },
          },
        ),
        403,
        "expense operators must not update second-person approval settings",
      );
    } finally {
      await actorApi?.dispose();
    }
  });

  test("tenant administrators expose explicit delegated authority instead of a wildcard", async ({
    request: adminApi,
  }) => {
    let actorApi: APIRequestContext | undefined;
    try {
      const actor = await createActorWithRole(adminApi, "tenant-admin", "TENANT_ADMIN");
      actorApi = await createActorAccountAndLogin(adminApi, actor);
      const currentActor = await getCurrentActor(actorApi, tenantHeaders());

      expect(currentActor.roleCodes).toEqual(["TENANT_ADMIN"]);
      expect(currentActor.intrinsicPermissions).toContain("people.self.read");
      expect(currentActor.delegatedPermissions).toContain("tenants.read");
      expect(currentActor.delegatedPermissions).toContain("authz.tenant_role_grants.manage");
      expect(currentActor.delegatedPermissions).toContain("people.create");
      expect(currentActor.delegatedPermissions).toContain("collaborators.update");
      expect(currentActor.delegatedPermissions).toContain("reference_data.read");
      expect(currentActor.delegatedPermissions).toContain("gold_prices.manage");
      expect(currentActor.delegatedPermissions).toContain("gold_production.manage");
      expect(currentActor.delegatedPermissions).toContain("current_accounts.settings.update");
      expect(currentActor.delegatedPermissions).toContain("journey.settlements.close");
      expect(currentActor.delegatedPermissions).not.toContain("*");
      expect(currentActor.delegatedPermissions).not.toContain("authz.read");
      expect(currentActor.delegatedPermissions).not.toContain("authz.manage");
      expect(currentActor.delegatedPermissions).not.toContain("tenants.create");
      expect(currentActor.delegatedPermissions).not.toContain("tenants.update");
      expect(currentActor.delegatedPermissions).not.toContain("people.self.read");
      expect(currentActor.permissions).toContain("people.self.read");
      expect(currentActor.permissions).toContain("journey.settlements.close");
    } finally {
      await actorApi?.dispose();
    }
  });

  test("tenant administrators can grant and remove operator roles without removing target self-service", async ({
    request: adminApi,
  }) => {
    let tenantAdminApi: APIRequestContext | undefined;
    let targetApi: APIRequestContext | undefined;
    let tenantAdmin: ProvisionedAuthzActor | undefined;
    let target: ProvisionedAuthzActor | undefined;
    try {
      tenantAdmin = await createActorWithRole(adminApi, "tenant-role-manager", "TENANT_ADMIN");
      target = await createActorWithRole(adminApi, "tenant-role-target", "EXPENSE_OPERATOR");
      tenantAdminApi = await createActorAccountAndLogin(adminApi, tenantAdmin);
      targetApi = await createActorAccountAndLogin(adminApi, target);
      const headers = tenantHeaders();

      const manager = await getCurrentActor(tenantAdminApi, headers);
      expect(manager.delegatedPermissions).toContain("authz.tenant_role_grants.manage");

      const actorsResponse = await tenantAdminApi.get(
        e2eApiUrl("/api/v1/authz/tenant-role-actors"),
        { headers },
      );
      await expectStatus(actorsResponse, 200, "list tenant role delegation actors");
      const actorsBody = (await actorsResponse.json()) as ApiEnvelope<AuthzActor[]>;
      const targetActor = actorsBody.data?.find((candidate) => candidate.id === target?.id);
      const expenseGrant = targetActor?.roleGrants?.find(
        (grant) => grant.roleCode === "EXPENSE_OPERATOR" && grant.active,
      );
      if (!targetActor || !expenseGrant) {
        throw new Error("tenant role delegation directory did not expose the target expense grant");
      }

      const revokeResponse = await tenantAdminApi.delete(
        e2eApiUrl(
          `/api/v1/authz/tenant-role-actors/${encodeURIComponent(target.id)}/role-grants/${encodeURIComponent(expenseGrant.id)}`,
        ),
        { headers },
      );
      await expectStatus(revokeResponse, 200, "Tenant Administrator revokes Expense Operator");

      const afterRevoke = await getCurrentActor(targetApi, headers);
      expect(afterRevoke.roleCodes).not.toContain("EXPENSE_OPERATOR");
      expect(afterRevoke.delegatedPermissions).not.toContain("expenses.create");
      expect(afterRevoke.intrinsicPermissions).toContain("people.self.read");
      expect(afterRevoke.permissions).toContain("people.self.read");

      const grantResponse = await tenantAdminApi.post(
        e2eApiUrl(`/api/v1/authz/tenant-role-actors/${encodeURIComponent(target.id)}/role-grants`),
        {
          headers,
          data: { roleCode: "EARNINGS_OPERATOR" },
        },
      );
      await expectStatus(grantResponse, 201, "Tenant Administrator grants Earnings Operator");

      const afterGrant = await getCurrentActor(targetApi, headers);
      expect(afterGrant.roleCodes).toContain("EARNINGS_OPERATOR");
      expect(afterGrant.delegatedPermissions).toContain("planning.create");
      expect(afterGrant.intrinsicPermissions).toContain("people.self.read");

      const forbiddenAdminGrant = await tenantAdminApi.post(
        e2eApiUrl(`/api/v1/authz/tenant-role-actors/${encodeURIComponent(target.id)}/role-grants`),
        {
          headers,
          data: { roleCode: "TENANT_ADMIN" },
        },
      );
      await expectStatus(forbiddenAdminGrant, 400, "Tenant Administrator cannot delegate Tenant Administrator");
    } finally {
      await tenantAdminApi?.dispose();
      await targetApi?.dispose();
      if (tenantAdmin) await setActorActive(adminApi, tenantAdmin.id, false);
      if (target) await setActorActive(adminApi, target.id, false);
    }
  });

  test("earnings operators can perform planning work but cannot create expenses or price-list records", async ({
    request: adminApi,
  }) => {
    let actorApi: APIRequestContext | undefined;
    try {
      const actor = await createActorWithRole(adminApi, "earnings", "EARNINGS_OPERATOR");
      actorApi = await createActorAccountAndLogin(adminApi, actor);
      const headers = tenantHeaders();

      const currentActor = await getCurrentActor(actorApi, headers);
      expect(currentActor.actorKey).toBe(actor.actorKey);
      expect(currentActor.roleCodes).toContain("EARNINGS_OPERATOR");
      expect(currentActor.intrinsicPermissions).toContain("people.self.read");
      expect(currentActor.delegatedPermissions).toContain("planning.create");
      expect(currentActor.permissions).toContain("planning.create");
      expect(currentActor.permissions).toContain("earnings.create");
      expect(currentActor.permissions).not.toContain("expenses.create");
      expect(currentActor.permissions).not.toContain("price_lists.create");
      expect(currentActor.delegatedPermissions).not.toContain("gold_production.manage");

      await expectStatus(
        await actorApi.get(e2eApiUrl("/api/v1/work-periods?pageSize=1"), { headers }),
        200,
        "earnings operators should read planning work periods",
      );

      await expectStatus(
        await actorApi.post(e2eApiUrl("/api/v1/work-periods"), {
          headers,
          data: {},
        }),
        400,
        "earnings operators should reach work-period creation validation",
      );

      await expectStatus(
        await actorApi.post(
          e2eApiUrl("/api/v1/work-periods/forbidden-work-period/gold-production-entries"),
          {
            headers,
            data: {
              locationId: "forbidden-location",
              productionDate: "2026-08-18",
              goldGramsProduced: 1,
            },
          },
        ),
        403,
        "earnings operators must not record Gold Production",
      );

      await expectStatus(
        await actorApi.post(e2eApiUrl("/api/v1/expenses"), {
          headers,
          data: {},
        }),
        403,
        "earnings operators must not create expenses",
      );

      await expectStatus(
        await actorApi.post(e2eApiUrl("/api/v1/price-list-items"), {
          headers,
          data: {},
        }),
        403,
        "earnings operators must not create price-list items",
      );
    } finally {
      await actorApi?.dispose();
    }
  });

  test("inactive tenant actors make the selected tenant unavailable without invalidating the Account session", async ({
    request: adminApi,
  }) => {
    let actorApi: APIRequestContext | undefined;
    try {
      const actor = await createActorWithRole(adminApi, "inactive", "EXPENSE_OPERATOR");
      actorApi = await createActorAccountAndLogin(adminApi, actor);

      await setActorActive(adminApi, actor.id, false);

      const response = await actorApi.get(e2eApiUrl("/api/v1/authz/current-actor"), {
        headers: tenantHeaders(),
      });
      await expectStatus(
        response,
        403,
        "inactive tenant actor should make the selected tenant unavailable",
      );
      await expectErrorCode(response, "tenant_actor_unavailable");

      const sessionResponse = await actorApi.get(e2eApiUrl("/api/v1/auth/session"));
      await expectStatus(
        sessionResponse,
        200,
        "inactive tenant actor must not invalidate the Authentication Account session",
      );
    } finally {
      await actorApi?.dispose();
    }
  });

  test("role grants enforce application and tenant scope rules", async ({ request: adminApi }) => {
    const actor = await createAuthzActor(adminApi, `scope-rules-${uniqueSuffix()}`);

    const invalidApplicationGrant = await adminApi.post(
      e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actor.id)}/role-grants`),
      {
        headers: authzHeaders(),
        data: { roleCode: "APPLICATION_ADMIN", tenantId: DEFAULT_TENANT_ID },
      },
    );
    await expectStatus(
      invalidApplicationGrant,
      400,
      "application administrator grants must use global tenant scope",
    );
    await expectValidationField(invalidApplicationGrant, "tenantId");

    const invalidTenantGrant = await adminApi.post(
      e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actor.id)}/role-grants`),
      {
        headers: authzHeaders(),
        data: { roleCode: "EXPENSE_OPERATOR", tenantId: "*" },
      },
    );
    await expectStatus(
      invalidTenantGrant,
      400,
      "tenant-scoped operational grants must not use global tenant scope",
    );
    await expectValidationField(invalidTenantGrant, "tenantId");

    const unboundTenantGrant = await adminApi.post(
      e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actor.id)}/role-grants`),
      {
        headers: authzHeaders(),
        data: { roleCode: "EXPENSE_OPERATOR", tenantId: DEFAULT_TENANT_ID },
      },
    );
    await expectStatus(
      unboundTenantGrant,
      400,
      "tenant delegated roles require an Actor already bound to that tenant",
    );
    await expectValidationField(unboundTenantGrant, "actorId");
  });
});

async function newIsolatedApi(): Promise<APIRequestContext> {
  return playwrightRequest.newContext({
    storageState: { cookies: [], origins: [] },
  });
}

async function loginIsolatedApi(
  login: string,
  password: string,
): Promise<APIRequestContext> {
  const api = await newIsolatedApi();
  const response = await api.post(e2eApiUrl("/api/v1/auth/login"), {
    data: { login, password },
  });
  try {
    await expectStatus(response, 200, `authenticate ${login}`);
  } catch (error) {
    await api.dispose();
    throw error;
  }
  return api;
}

function actorHeaders(actorKey: string, tenantId = DEFAULT_TENANT_ID): Record<string, string> {
  return {
    "X-Actor-ID": actorKey,
    "X-Tenant-ID": tenantId,
  };
}

function tenantHeaders(tenantId = DEFAULT_TENANT_ID): Record<string, string> {
  return { "X-Tenant-ID": tenantId };
}

async function createActorAccountAndLogin(
  _adminApi: APIRequestContext,
  actor: ProvisionedAuthzActor,
): Promise<APIRequestContext> {
  const firstSession = await loginIsolatedApi(actor.login, actor.temporaryPassword);
  const permanentPassword = `${actor.temporaryPassword}-Changed`;
  const changeResponse = await firstSession.post(e2eApiUrl("/api/v1/auth/password/change"), {
    data: {
      currentPassword: actor.temporaryPassword,
      newPassword: permanentPassword,
    },
  });
  try {
    await expectStatus(changeResponse, 204, `complete first-login password change for ${actor.login}`);
  } finally {
    await firstSession.dispose();
  }
  return loginIsolatedApi(actor.login, permanentPassword);
}

async function createActorWithRole(
  api: APIRequestContext,
  keyPrefix: string,
  roleCode: RoleCode,
): Promise<ProvisionedAuthzActor> {
  const seed = uniqueNumericSuffix();
  const login = `authz-${keyPrefix}-${seed}@example.com`;
  const personResponse = await api.post(e2eApiUrl("/api/v1/people"), {
    headers: authzHeaders(),
    data: {
      firstName: `Authz${keyPrefix}`,
      lastName: "Boundary",
      nickname: `${keyPrefix}-${seed}`,
      cpf: validCPF(seed),
      rg: `RG-AUTHZ-${String(seed).slice(-8)}`,
      cellular: validBrazilianCellular(seed),
      email: login,
      statusId: "ref-person-status-active",
    },
  });
  await expectStatus(personResponse, 201, `create Person for ${roleCode}`);

  const temporaryPassword = `E2E-${seed}-Password!`;
  const accountResponse = await api.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: authzHeaders(DEFAULT_TENANT_ID),
    data: {
      login,
      temporaryPassword,
    },
  });
  await expectStatus(accountResponse, 201, `create tenant-bound authentication account for ${login}`);
  const accountBody = (await accountResponse.json()) as ApiEnvelope<AuthAccount>;
  const accountActor = accountBody.data?.actors.find(
    (candidate) => candidate.tenantId === DEFAULT_TENANT_ID,
  );
  if (!accountActor) {
    throw new Error(`Authentication account ${login} did not include a default-tenant Actor`);
  }

  await grantRole(api, accountActor.actorId, roleCode, DEFAULT_TENANT_ID);
  return {
    id: accountActor.actorId,
    actorKey: accountActor.actorKey,
    displayName: accountActor.displayName,
    active: accountActor.active,
    login,
    temporaryPassword,
  };
}

async function createAuthzActor(api: APIRequestContext, keyPrefix: string): Promise<AuthzActor> {
  const actorKey = `authz-${keyPrefix}-e2e@example.com`;
  const response = await api.post(e2eApiUrl("/api/v1/authz/actors"), {
    headers: authzHeaders(),
    data: {
      actorKey,
      displayName: `Authorization E2E ${keyPrefix}`,
      active: true,
    },
  });
  await expectStatus(response, 201, `create actor ${actorKey}`);

  const body = (await response.json()) as ApiEnvelope<AuthzActor>;
  if (!body.data) {
    throw new Error("Create actor response did not include data");
  }
  return body.data;
}

async function grantRole(
  api: APIRequestContext,
  actorId: string,
  roleCode: RoleCode,
  tenantId: string,
): Promise<void> {
  const response = await api.post(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId)}/role-grants`),
    {
      headers: authzHeaders(),
      data: { roleCode, tenantId },
    },
  );
  await expectStatus(response, 201, `grant ${roleCode} to ${actorId}`);
}

async function setActorActive(
  api: APIRequestContext,
  actorId: string,
  active: boolean,
): Promise<void> {
  const response = await api.patch(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId)}/active`),
    {
      headers: authzHeaders(),
      data: { active },
    },
  );
  await expectStatus(response, 200, `set actor ${actorId} active=${active}`);
}

async function getCurrentActor(
  api: APIRequestContext,
  headers: Record<string, string>,
): Promise<AuthzCurrentActor> {
  const response = await api.get(e2eApiUrl("/api/v1/authz/current-actor"), {
    headers,
  });
  await expectStatus(response, 200, "get current actor");

  const body = (await response.json()) as ApiEnvelope<AuthzCurrentActor>;
  if (!body.data) {
    throw new Error("Current actor response did not include data");
  }
  return body.data;
}

async function expectStatus(
  response: APIResponse,
  expectedStatus: number,
  context: string,
): Promise<void> {
  if (response.status() !== expectedStatus) {
    throw new Error(
      `${context}: expected HTTP ${expectedStatus}, got ${response.status()} ${await response.text()}`,
    );
  }
}

async function expectErrorCode(response: APIResponse, expectedCode: string): Promise<void> {
  const body = (await response.json()) as ApiEnvelope<unknown>;
  expect(body.error?.code).toBe(expectedCode);
}

async function expectValidationField(response: APIResponse, fieldName: string): Promise<void> {
  const body = (await response.json()) as ApiEnvelope<unknown>;
  expect(body.error?.fields?.[fieldName]).toBeTruthy();
}

function uniqueNumericSuffix(): number {
  const timestampDigits = Date.now() % 1_000_000;
  const randomDigits = Math.floor(Math.random() * 1000);
  return timestampDigits * 1000 + randomDigits;
}

function validBrazilianCellular(seed: number): string {
  const uniqueDigits = String(seed).padStart(8, "0").slice(-8);
  return `11${`9${uniqueDigits}`.slice(0, 9)}`;
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

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
