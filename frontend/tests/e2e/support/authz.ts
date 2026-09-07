import {
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { isLoopbackURL, resolveE2EAuthMode } from "./runtime";
import {
  applicationAdminStorageStatePath,
  tenantAdminStorageStatePath,
} from "./storage";

declare const process: {
  env: Record<string, string | undefined>;
};

const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";
const configuredAuthMode = resolveE2EAuthMode(
  configuredBaseURL,
  process.env.PLAYWRIGHT_AUTH_MODE,
);

export const E2E_ACTOR_ID =
  process.env.PLAYWRIGHT_TENANT_ADMIN_ACTOR_ID ?? "e2e-default-tenant-admin";
export const E2E_APPLICATION_ADMIN_ACTOR_ID =
  process.env.PLAYWRIGHT_APPLICATION_ADMIN_ACTOR_ID ?? "e2e-application-admin";
export const E2E_TENANT_ID = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";

const e2eFrontendBaseURL = configuredBaseURL;
const e2eApiBaseURL =
  process.env.PLAYWRIGHT_E2E_API_BASE_URL ?? defaultE2EApiBaseURL(e2eFrontendBaseURL);
const e2eAuthMode = configuredAuthMode;

const deterministicTenantAdminLogins: Record<string, string> = {
  default: "tenant-admin@example.com",
  "e2e-authz-admin-tenant": "e2e-authz-admin-tenant-admin@example.com",
  "e2e-authz-role-tenant": "e2e-authz-role-tenant-admin@example.com",
  "e2e-isolation-tenant": "e2e-isolation-tenant-admin@example.com",
};

function tenantAdminPassword(): string {
  const configured =
    process.env.E2E_TENANT_ADMIN_PASSWORD ||
    process.env.E2E_ADMIN_PASSWORD ||
    (isLoopbackURL(configuredBaseURL) ? "Local-E2E-Administrator-28D!" : "");
  if (!configured) {
    throw new Error(
      "E2E_TENANT_ADMIN_PASSWORD is required to authenticate deterministic deployed Tenant Administrator fixtures",
    );
  }
  return configured;
}

function tenantAdminLogin(tenantId: string): string {
  if (tenantId === E2E_TENANT_ID) {
    const configured = process.env.E2E_TENANT_ADMIN_EMAIL?.trim();
    if (configured) return configured;
  }
  const login = deterministicTenantAdminLogins[tenantId];
  if (!login) {
    throw new Error(
      `No deterministic E2E Tenant Administrator login is configured for Tenant ${tenantId}`,
    );
  }
  return login;
}

export async function newApplicationAdminApi(): Promise<APIRequestContext> {
  if (e2eAuthMode === "headers") {
    return playwrightRequest.newContext({
      baseURL: e2eApiBaseURL,
      extraHTTPHeaders: applicationAdminHeaders(),
    });
  }

  return playwrightRequest.newContext({
    baseURL: e2eApiBaseURL,
    storageState: applicationAdminStorageStatePath,
    extraHTTPHeaders: { "X-Tenant-ID": "*" },
  });
}

export async function newTenantAdminApi(
  tenantId = E2E_TENANT_ID,
): Promise<APIRequestContext> {
  if (e2eAuthMode === "headers") {
    return playwrightRequest.newContext({
      baseURL: e2eApiBaseURL,
      extraHTTPHeaders: authzHeaders(tenantId),
    });
  }

  if (tenantId === E2E_TENANT_ID) {
    return playwrightRequest.newContext({
      baseURL: e2eApiBaseURL,
      storageState: tenantAdminStorageStatePath,
      extraHTTPHeaders: { "X-Tenant-ID": tenantId },
    });
  }

  const api = await playwrightRequest.newContext({
    baseURL: e2eApiBaseURL,
    extraHTTPHeaders: { "X-Tenant-ID": tenantId },
  });
  const login = tenantAdminLogin(tenantId);
  const loginResponse = await api.post("/api/v1/auth/login", {
    data: { login, password: tenantAdminPassword() },
  });
  if (!loginResponse.ok()) {
    const body = await loginResponse.text();
    await api.dispose();
    throw new Error(
      `Authenticate deterministic Tenant Administrator ${login} for Tenant ${tenantId}: HTTP ${loginResponse.status()} ${body}`,
    );
  }

  const actorResponse = await api.get("/api/v1/authz/current-actor");
  if (!actorResponse.ok()) {
    const body = await actorResponse.text();
    await api.dispose();
    throw new Error(
      `Resolve deterministic Tenant Administrator ${login} for Tenant ${tenantId}: HTTP ${actorResponse.status()} ${body}`,
    );
  }
  const actorEnvelope = (await actorResponse.json()) as {
    data?: { tenantId?: string; scope?: string; roleCodes?: string[] };
  };
  if (
    actorEnvelope.data?.tenantId !== tenantId ||
    actorEnvelope.data?.scope !== "TENANT" ||
    !(actorEnvelope.data?.roleCodes ?? []).includes("TENANT_ADMIN")
  ) {
    await api.dispose();
    throw new Error(
      `Deterministic Tenant Administrator ${login} did not resolve to TENANT/TENANT_ADMIN for Tenant ${tenantId}`,
    );
  }

  return api;
}

export function e2eApiUrl(path: string): string {
  return new URL(path, e2eApiBaseURL).toString();
}

// Session-mode E2E must prove the same authorization path used by deployed ERS.
// Never let X-Actor-ID silently impersonate another Actor when a real Account
// session is present. Header impersonation remains available only in the
// explicitly selected test-only "headers" mode.
export function authzHeaders(tenantId = E2E_TENANT_ID): Record<string, string> {
  return e2eAuthMode === "headers"
    ? {
        "X-Actor-ID": tenantActorFor(tenantId),
        "X-Tenant-ID": tenantId,
      }
    : { "X-Tenant-ID": tenantId };
}

function tenantActorFor(tenantId: string): string {
  switch (tenantId) {
    case "e2e-authz-admin-tenant":
      return "e2e-authz-admin-tenant-admin";
    case "e2e-authz-role-tenant":
      return "e2e-authz-role-tenant-admin";
    case "e2e-isolation-tenant":
      return "e2e-isolation-tenant-admin";
    default:
      return E2E_ACTOR_ID;
  }
}

export function applicationAdminHeaders(): Record<string, string> {
  return e2eAuthMode === "headers"
    ? {
        "X-Actor-ID": E2E_APPLICATION_ADMIN_ACTOR_ID,
        "X-Tenant-ID": "*",
      }
    : { "X-Tenant-ID": "*" };
}

export async function seedBrowserAuthz(page: Page): Promise<void> {
  if (e2eAuthMode === "headers") {
    await page.route("**/api/**", async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          ...authzHeaders(),
        },
      });
    });
  }

  await page.addInitScript(
    ({ tenantId }) => {
      window.localStorage.setItem("ers.auth.selectedTenantId", tenantId);
    },
    { tenantId: E2E_TENANT_ID },
  );
}

export async function seedBrowserApplicationAdmin(page: Page): Promise<void> {
  if (e2eAuthMode === "headers") {
    await page.route("**/api/**", async (route) => {
      await route.continue({
        headers: {
          ...route.request().headers(),
          ...applicationAdminHeaders(),
        },
      });
    });
  }

  await page.addInitScript(() => {
    window.localStorage.setItem("ers.auth.selectedTenantId", "*");
  });
}

function defaultE2EApiBaseURL(frontendBaseURL: string): string {
  try {
    const url = new URL(frontendBaseURL);
    const isLocalHost =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";

    if (isLocalHost && url.port === "15173") {
      return "http://localhost:18080";
    }

    if (isLocalHost && url.port === "5173") {
      return "http://localhost:8080";
    }
  } catch {
    return frontendBaseURL;
  }

  return frontendBaseURL;
}
