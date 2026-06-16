import type { Page } from "@playwright/test";

declare const process: {
  env: Record<string, string | undefined>;
};

export const E2E_ACTOR_ID = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
export const E2E_TENANT_ID = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";
const e2eBaseURL = process.env.PLAYWRIGHT_E2E_API_BASE_URL
  ?? process.env.PLAYWRIGHT_BASE_URL
  ?? "http://localhost:5173";

export function e2eApiUrl(path: string): string {
  return new URL(path, e2eBaseURL).toString();
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
