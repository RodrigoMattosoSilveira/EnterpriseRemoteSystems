import type { Page } from "@playwright/test";
import { resolveE2EAuthMode } from "./runtime";

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

export function e2eApiUrl(path: string): string {
  return new URL(path, e2eApiBaseURL).toString();
}

export function authzHeaders(tenantId = E2E_TENANT_ID): Record<string, string> {
  return {
    "X-Actor-ID": tenantActorFor(tenantId),
    "X-Tenant-ID": tenantId,
  };
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
  return {
    "X-Actor-ID": E2E_APPLICATION_ADMIN_ACTOR_ID,
    "X-Tenant-ID": "*",
  };
}

export async function seedBrowserAuthz(page: Page): Promise<void> {
  if (e2eAuthMode === "headers" || e2eAuthMode === "session") {
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
  if (e2eAuthMode === "headers" || e2eAuthMode === "session") {
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
