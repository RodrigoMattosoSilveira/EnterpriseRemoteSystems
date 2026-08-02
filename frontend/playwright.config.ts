import { defineConfig, devices } from "@playwright/test";

declare const process: {
  env: Record<string, string | undefined>;
};

const runtimeEnv = process.env;
const isCI = runtimeEnv.CI === "true";
const skipWebServer = runtimeEnv.PLAYWRIGHT_SKIP_WEBSERVER === "true";

// Local E2E uses dedicated ports and never reuses development servers. That
// guarantees the suite exercises the checked-out branch and reset E2E database.
const LOCAL_E2E_FRONTEND_PORT = 15_173;
const LOCAL_E2E_BACKEND_PORT = 18_080;
const localE2EFrontendURL = `http://localhost:${LOCAL_E2E_FRONTEND_PORT}`;
const localE2EBackendURL = `http://localhost:${LOCAL_E2E_BACKEND_PORT}`;

const baseURL = runtimeEnv.PLAYWRIGHT_BASE_URL ?? localE2EFrontendURL;
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
              name: "ers.auth.selectedTenantId",
              value: authzTenantId,
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
            `cd .. && HTTP_ADDR=:${LOCAL_E2E_BACKEND_PORT} ERS_DATABASE_PATH=data/app-e2e.db ERS_RESET_DATABASE=true APP_ENV=ci AUTHZ_ACTOR_HEADER_MODE=test AUTHZ_BOOTSTRAP_ENABLED=true AUTHZ_BOOTSTRAP_ACTOR_KEY=bootstrap-admin AUTHZ_BOOTSTRAP_DISPLAY_NAME='Bootstrap Admin' AUTHZ_BOOTSTRAP_ROLE_CODE=APPLICATION_ADMIN AUTHZ_BOOTSTRAP_TENANT_ID='*' AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE=false make local-backend`,
          url: `${localE2EBackendURL}/healthz`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command:
            `ERS_API_PROXY_TARGET=http://127.0.0.1:${LOCAL_E2E_BACKEND_PORT} ERS_E2E_AUTHZ_PROXY=true PLAYWRIGHT_AUTHZ_ACTOR_ID=bootstrap-admin PLAYWRIGHT_AUTHZ_TENANT_ID=default npm run dev -- --host 0.0.0.0 --port ${LOCAL_E2E_FRONTEND_PORT}`,
          url: localE2EFrontendURL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});