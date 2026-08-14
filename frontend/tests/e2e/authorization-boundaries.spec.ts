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

type AuthzActor = {
  id: string;
  actorKey: string;
  displayName: string;
  active: boolean;
};

type AuthzCurrentActor = {
  actorKey: string;
  actorRecordId: string;
  tenantId: string;
  scope: string;
  roleCodes: string[];
  permissions: string[];
};

type RoleCode =
  | "APPLICATION_ADMIN"
  | "TENANT_ADMIN"
  | "EARNINGS_OPERATOR"
  | "EXPENSE_OPERATOR"
  | "PERSON";

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
      expect(currentActor.permissions).toContain("expenses.create");
      expect(currentActor.permissions).toContain("ledger.receipts.print");
      expect(currentActor.permissions).not.toContain("authz.manage");

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
      expect(currentActor.permissions).toContain("planning.create");
      expect(currentActor.permissions).toContain("earnings.create");
      expect(currentActor.permissions).not.toContain("expenses.create");
      expect(currentActor.permissions).not.toContain("price_lists.create");

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

  test("inactive persisted actors are rejected", async ({ request: adminApi }) => {
    let actorApi: APIRequestContext | undefined;
    try {
      const actor = await createActorWithRole(adminApi, "inactive", "EXPENSE_OPERATOR");
      actorApi = await createActorAccountAndLogin(adminApi, actor);

      await setActorActive(adminApi, actor.id, false);

      const response = await actorApi.get(e2eApiUrl("/api/v1/authz/current-actor"), {
        headers: tenantHeaders(),
      });
      await expectStatus(response, 401, "inactive actors should be rejected");
      await expectErrorCode(response, "actor_inactive");
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
  adminApi: APIRequestContext,
  actor: AuthzActor,
): Promise<APIRequestContext> {
  const temporaryPassword = `E2E-${uniqueSuffix()}-Password!`;
  const response = await adminApi.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: authzHeaders(),
    data: {
      actorId: actor.id,
      login: actor.actorKey,
      temporaryPassword,
      mustChangePassword: false,
    },
  });
  await expectStatus(response, 201, `create authentication account for ${actor.actorKey}`);
  return loginIsolatedApi(actor.actorKey, temporaryPassword);
}

async function createActorWithRole(
  api: APIRequestContext,
  keyPrefix: string,
  roleCode: RoleCode,
): Promise<AuthzActor> {
  const actor = await createAuthzActor(api, `${keyPrefix}-${uniqueSuffix()}`);
  await grantRole(api, actor.id, roleCode, DEFAULT_TENANT_ID);
  return actor;
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

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}
