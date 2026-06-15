import { defineConfig, devices } from "@playwright/test";

declare const process: {
  env: Record<string, string | undefined>;
};

const runtimeEnv = process.env;
const isCI = runtimeEnv.CI === "true";
const skipWebServer = runtimeEnv.PLAYWRIGHT_SKIP_WEBSERVER === "true";

const baseURL = runtimeEnv.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";
const storageOrigin = new URL(baseURL).origin;

const authzActorId = runtimeEnv.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
const authzTenantId = runtimeEnv.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    extraHTTPHeaders: {
      "X-Actor-ID": authzActorId,
      "X-Tenant-ID": authzTenantId,
    },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: storageOrigin,
          localStorage: [
            {
              name: "ers.authzAdmin.requestActor",
              value: JSON.stringify({
                actorId: authzActorId,
                tenantId: authzTenantId,
              }),
            },
          ],
        },
      ],
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: skipWebServer
    ? undefined
    : [
        {
          command:
            "cd .. && ERS_DATABASE_PATH=data/app-e2e.db ERS_RESET_DATABASE=true AUTHZ_BOOTSTRAP_ENABLED=true AUTHZ_BOOTSTRAP_ACTOR_KEY=bootstrap-admin AUTHZ_BOOTSTRAP_DISPLAY_NAME='Bootstrap Admin' AUTHZ_BOOTSTRAP_ROLE_CODE=APPLICATION_ADMIN AUTHZ_BOOTSTRAP_TENANT_ID='*' AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE=false make local-backend",
          url: "http://localhost:8080/healthz",
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
        {
          command:
            "ERS_E2E_AUTHZ_PROXY=true PLAYWRIGHT_AUTHZ_ACTOR_ID=bootstrap-admin PLAYWRIGHT_AUTHZ_TENANT_ID=default npm run dev -- --host 0.0.0.0 --port 5173",
          url: "http://localhost:5173",
          reuseExistingServer: !isCI,
          timeout: 120_000,
        },
      ],
});