import type { Page } from "@playwright/test";
import { resolveE2EAuthMode } from "./runtime";

declare const process: {
  env: Record<string, string | undefined>;
};

const configuredBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";
const configuredAuthMode = resolveE2EAuthMode(configuredBaseURL, process.env.PLAYWRIGHT_AUTH_MODE);
export const E2E_ACTOR_ID = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? (configuredAuthMode === "session" ? "e2e-application-admin" : "bootstrap-admin");
export const E2E_TENANT_ID = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";

// Local Playwright starts its isolated frontend on 15173. CI and deployed
// runs provide PLAYWRIGHT_BASE_URL explicitly, so they retain their configured
// origin while local direct API setup calls stay on the isolated backend.
const e2eFrontendBaseURL = configuredBaseURL;
const e2eApiBaseURL = process.env.PLAYWRIGHT_E2E_API_BASE_URL ?? defaultE2EApiBaseURL(e2eFrontendBaseURL);
const e2eAuthMode = configuredAuthMode;

export function e2eApiUrl(path: string): string {
  return new URL(path, e2eApiBaseURL).toString();
}

export function authzHeaders(tenantId = E2E_TENANT_ID): Record<string, string> {
  if (e2eAuthMode === "session") {
    return { "X-Tenant-ID": tenantId };
  }

  return {
    "X-Actor-ID": E2E_ACTOR_ID,
    "X-Tenant-ID": tenantId,
  };
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
