import type { Page } from "@playwright/test";

declare const process: {
  env: Record<string, string | undefined>;
};

export const E2E_ACTOR_ID = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
export const E2E_TENANT_ID = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";

const e2eFrontendBaseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const e2eApiBaseURL = process.env.PLAYWRIGHT_E2E_API_BASE_URL ?? defaultE2EApiBaseURL(e2eFrontendBaseURL);

export function e2eApiUrl(path: string): string {
  return new URL(path, e2eApiBaseURL).toString();
}

export function authzHeaders(): Record<string, string> {
  return {
    "X-Actor-ID": E2E_ACTOR_ID,
    "X-Tenant-ID": E2E_TENANT_ID,
  };
}

export async function seedBrowserAuthz(page: Page): Promise<void> {
  await page.route("**/api/**", async (route) => {
    await route.continue({
      headers: {
        ...route.request().headers(),
        ...authzHeaders(),
      },
    });
  });

  await page.addInitScript(
    ({ actorId, tenantId }) => {
      window.localStorage.setItem(
        "ers.authzAdmin.requestActor",
        JSON.stringify({ actorId, tenantId }),
      );
    },
    { actorId: E2E_ACTOR_ID, tenantId: E2E_TENANT_ID },
  );
}

function defaultE2EApiBaseURL(frontendBaseURL: string): string {
  try {
    const url = new URL(frontendBaseURL);
    const isLocalVite =
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      url.port === "5173";

    if (isLocalVite) {
      return "http://localhost:8080";
    }
  } catch {
    return frontendBaseURL;
  }

  return frontendBaseURL;
}
