import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { e2eApiUrl, newTenantAdminApi } from "./support/authz";
import { isLoopbackURL } from "./support/runtime";

declare const process: { env: Record<string, string | undefined> };

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";
const login = "e2e-multi-tenant-person@example.com";
const personId = "e2e-multi-tenant-person";
const accountId = "e2e-multi-tenant-account";
const tenantA = {
  id: "e2e-multi-tenant-a",
  name: "E2E Multi Tenant A",
  actorKey: "e2e-multi-tenant-actor-e2e-multi-tenant-a",
  membershipId: "e2e-multi-tenant-membership-e2e-multi-tenant-a",
};
const tenantB = {
  id: "e2e-multi-tenant-b",
  name: "E2E Multi Tenant B",
  actorKey: "e2e-multi-tenant-actor-e2e-multi-tenant-b",
  membershipId: "e2e-multi-tenant-membership-e2e-multi-tenant-b",
};

function fixturePassword(): string {
  const password =
    process.env.E2E_TENANT_ADMIN_PASSWORD ||
    process.env.E2E_ADMIN_PASSWORD ||
    (isLoopbackURL(baseURL) ? "Local-E2E-Administrator-28D!" : "");
  if (!password) {
    throw new Error(
      "E2E_TENANT_ADMIN_PASSWORD is required for the deterministic Bite 30L multi-Tenant Person fixture",
    );
  }
  return password;
}

test.describe("Bite 30L multi-Tenant identity and confidentiality", () => {
  test("one Account selects the exact Tenant Actor and exposes only that Membership projection", async () => {
    const api = await authenticatedFixtureApi();
    try {
      const optionsResponse = await api.get(e2eApiUrl("/api/v1/auth/tenant-options"));
      expect(optionsResponse.status()).toBe(200);
      const optionsEnvelope = (await optionsResponse.json()) as {
        data?: Array<{
          id?: string;
          actorKey?: string;
          membershipId?: string;
          actorScope?: string;
        }>;
      };
      const options = optionsEnvelope.data ?? [];
      expect(options).toHaveLength(2);
      expect(options.map((option) => option.id).sort()).toEqual(
        [tenantA.id, tenantB.id].sort(),
      );

      for (const tenant of [tenantA, tenantB]) {
        const option = options.find((candidate) => candidate.id === tenant.id);
        expect(option).toMatchObject({
          id: tenant.id,
          actorKey: tenant.actorKey,
          membershipId: tenant.membershipId,
          actorScope: "TENANT",
        });

        const actorResponse = await api.get(e2eApiUrl("/api/v1/authz/current-actor"), {
          headers: { "X-Tenant-ID": tenant.id },
        });
        expect(actorResponse.status()).toBe(200);
        const actorEnvelope = (await actorResponse.json()) as {
          data?: {
            actorKey?: string;
            tenantId?: string;
            scope?: string;
            accountId?: string;
          };
        };
        expect(actorEnvelope.data).toMatchObject({
          actorKey: tenant.actorKey,
          tenantId: tenant.id,
          scope: "TENANT",
        });

        const personResponse = await api.get(
          e2eApiUrl(`/api/v1/people/${encodeURIComponent(personId)}`),
          { headers: { "X-Tenant-ID": tenant.id } },
        );
        expect(personResponse.status()).toBe(200);
        const body = await personResponse.text();
        const personEnvelope = JSON.parse(body) as {
          data?: {
            id?: string;
            globalPersonId?: string;
            membershipId?: string;
            tenantId?: string;
            email?: string;
          };
        };
        expect(personEnvelope.data).toMatchObject({
          globalPersonId: personId,
          membershipId: tenant.membershipId,
          tenantId: tenant.id,
          email: login,
        });

        const otherTenant = tenant.id === tenantA.id ? tenantB : tenantA;
        expect(body).not.toContain(otherTenant.id);
        expect(body).not.toContain(otherTenant.actorKey);
        expect(body).not.toContain(otherTenant.membershipId);
      }

      const unrelatedResponse = await api.get(e2eApiUrl("/api/v1/authz/current-actor"), {
        headers: { "X-Tenant-ID": "e2e-authz-admin-tenant" },
      });
      expect([401, 403]).toContain(unrelatedResponse.status());
    } finally {
      await api.dispose();
    }
  });

  test("Tenant Administrators can locate the shared Global Person without learning the other Tenant relationship", async () => {
    for (const tenant of [tenantA, tenantB]) {
      const adminApi = await newTenantAdminApi(tenant.id);
      try {
        const response = await adminApi.get(e2eApiUrl("/api/v1/people/global"), {
          params: { search: login, page: "1", pageSize: "20" },
        });
        expect(response.status()).toBe(200);
        const body = await response.text();
        const envelope = JSON.parse(body) as {
          data?: {
            items?: Array<Record<string, unknown>>;
          } | Array<Record<string, unknown>>;
        };
        const items = Array.isArray(envelope.data)
          ? envelope.data
          : envelope.data?.items ?? [];
        const person = items.find((item) => item.id === personId);
        expect(person).toBeTruthy();
        expect(person).toMatchObject({ id: personId, email: login });
        expect(Object.keys(person ?? {}).sort()).toEqual(
          ["cellular", "cpf", "email", "firstName", "id", "lastName", "nickname", "rg"].sort(),
        );

        const otherTenant = tenant.id === tenantA.id ? tenantB : tenantA;
        expect(body).not.toContain(otherTenant.id);
        expect(body).not.toContain(otherTenant.actorKey);
        expect(body).not.toContain(otherTenant.membershipId);
      } finally {
        await adminApi.dispose();
      }
    }
  });

  test("the browser Tenant selector switches the same Account between Tenant A and Tenant B without a new login", async ({ browser }) => {
    const { context, page } = await signedInFixturePage(browser);
    try {
      const selector = page.getByRole("button", { name: "Current tenant" });
      await expect(selector).toBeVisible();

      const initialTenantId = await selector.getAttribute("data-selected-tenant-id");
      expect([tenantA.id, tenantB.id]).toContain(initialTenantId);
      const target = initialTenantId === tenantA.id ? tenantB : tenantA;

      await selector.click();
      const selection = page.getByRole("region", { name: "Tenant selection" });
      await expect(selection).toBeVisible();
      await expect(selection.getByRole("option", { name: new RegExp(tenantA.name) })).toBeVisible();
      await expect(selection.getByRole("option", { name: new RegExp(tenantB.name) })).toBeVisible();

      await selection.getByRole("option", { name: new RegExp(target.name) }).click();
      await expect(selector).toHaveAttribute("data-selected-tenant-id", target.id);
      await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);

      const storedTenantId = await page.evaluate(() =>
        window.localStorage.getItem("ers.auth.selectedTenantId"),
      );
      expect(storedTenantId).toBe(target.id);

      const actorResponse = await context.request.get(e2eApiUrl("/api/v1/authz/current-actor"), {
        headers: { "X-Tenant-ID": target.id },
      });
      expect(actorResponse.status()).toBe(200);
      const actorEnvelope = (await actorResponse.json()) as {
        data?: { actorKey?: string; tenantId?: string; scope?: string };
      };
      expect(actorEnvelope.data).toMatchObject({
        actorKey: target.actorKey,
        tenantId: target.id,
        scope: "TENANT",
      });
    } finally {
      await context.close();
    }
  });
});

async function authenticatedFixtureApi(): Promise<APIRequestContext> {
  const api = await playwrightRequest.newContext({ baseURL: e2eApiUrl("/") });
  const response = await api.post(e2eApiUrl("/api/v1/auth/login"), {
    data: { login, password: fixturePassword() },
  });
  if (!response.ok()) {
    const body = await response.text();
    await api.dispose();
    throw new Error(
      `Authenticate Bite 30L multi-Tenant fixture: HTTP ${response.status()} ${body}`,
    );
  }
  const envelope = (await response.json()) as { data?: { accountId?: string } };
  expect(envelope.data?.accountId).toBe(accountId);
  return api;
}

async function signedInFixturePage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Login").fill(login);
  await page.getByLabel("Password").fill(fixturePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
  return { context, page };
}
