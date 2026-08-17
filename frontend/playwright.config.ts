import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveE2EAuthMode } from "./tests/e2e/support/runtime";

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
const authMode = resolveE2EAuthMode(baseURL, runtimeEnv.PLAYWRIGHT_AUTH_MODE);
const authenticatedStorageStatePath = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "test-results",
  ".auth",
  "admin.json",
);

const authzActorId = runtimeEnv.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? (authMode === "session" ? "e2e-application-admin" : "bootstrap-admin");
const authzTenantId = runtimeEnv.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";

export default defineConfig({
  globalSetup: authMode === "session" ? "./tests/e2e/global-setup.ts" : undefined,
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  // Session-mode E2E uses one authenticated storage-state cookie created by
  // globalSetup and one shared app-e2e.db backend. Running multiple workers
  // would clone that same server-side session into concurrent browser contexts
  // while the tests also mutate authentication, tenant, and Person state. That
  // is not an isolation boundary: one worker can observe another worker's
  // lifecycle changes and protected pages can disappear mid-interaction.
  //
  // CI already runs one worker. Make the same guarantee explicit for every
  // session-authenticated run (local or deployed). Header mode remains eligible
  // for Playwright's normal parallelism because it is reserved for isolated
  // authorization-boundary scenarios that do not share a login session.
  workers: isCI || authMode === "session" ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Header mode deliberately fixes the actor and tenant for isolated
    // authorization tests. Session mode must not install a context-wide tenant
    // header: the application sends the tenant selected in localStorage, and a
    // fixed Playwright header would override browser tenant switching.
    extraHTTPHeaders:
      authMode === "headers"
        ? {
            "X-Actor-ID": authzActorId,
            "X-Tenant-ID": authzTenantId,
          }
        : undefined,
    storageState:
      authMode === "session"
        ? authenticatedStorageStatePath
        : {
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
            `cd .. && HTTP_ADDR=:${LOCAL_E2E_BACKEND_PORT} ERS_DATABASE_PATH=data/app-e2e.db ERS_RESET_DATABASE=true ERS_PROVISION_E2E_ADMIN=true E2E_ADMIN_EMAIL=admin@example.com E2E_ADMIN_PASSWORD='Local-E2E-Administrator-28D!' E2E_ADMIN_ACTOR_KEY=e2e-application-admin APP_ENV=ci AUTHZ_ACTOR_HEADER_MODE=test AUTHZ_BOOTSTRAP_ENABLED=true AUTHZ_BOOTSTRAP_ACTOR_KEY=bootstrap-admin AUTHZ_BOOTSTRAP_DISPLAY_NAME='Bootstrap Admin' AUTHZ_BOOTSTRAP_ROLE_CODE=APPLICATION_ADMIN AUTHZ_BOOTSTRAP_TENANT_ID='*' AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE=false make local-backend`,
          url: `${localE2EBackendURL}/healthz`,
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command:
            `ERS_API_PROXY_TARGET=http://127.0.0.1:${LOCAL_E2E_BACKEND_PORT} ERS_LOCAL_AUTHZ_BOOTSTRAP=false PLAYWRIGHT_AUTHZ_ACTOR_ID=e2e-application-admin PLAYWRIGHT_AUTHZ_TENANT_ID=default npm run dev -- --host 0.0.0.0 --port ${LOCAL_E2E_FRONTEND_PORT}`,
          url: localE2EFrontendURL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ],
});