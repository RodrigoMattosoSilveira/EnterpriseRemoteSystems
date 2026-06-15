import { defineConfig, devices } from "@playwright/test";

type RuntimeEnv = {
  PLAYWRIGHT_BASE_URL?: string;
  PLAYWRIGHT_SKIP_WEBSERVER?: string;
  CI?: string;
};

const runtimeEnv =
  (
    globalThis as unknown as {
      process?: {
        env?: RuntimeEnv;
      };
    }
  ).process?.env ?? {};

const baseURL = runtimeEnv.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173";

const skipWebServer = runtimeEnv.PLAYWRIGHT_SKIP_WEBSERVER === "true";

const isCI = runtimeEnv.CI === "true";

export default defineConfig({
  testDir: "./tests/e2e",

  fullyParallel: false,

  forbidOnly: isCI,

  retries: isCI ? 1 : 0,

  workers: isCI ? 1 : undefined,

  reporter: [
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["list"],
  ],

use: {
  baseURL: "http://localhost:5173",
  trace: "on-first-retry",
  extraHTTPHeaders: {
    "X-Actor-ID": "bootstrap-admin",
    "X-Tenant-ID": "default",
  },
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:5173",
        localStorage: [
          {
            name: "ers.authzAdmin.requestActor",
            value: JSON.stringify({
              actorId: "bootstrap-admin",
              tenantId: "default",
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
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],

  webServer: skipWebServer
  ? undefined
  : [
      {
        command: "cd .. && ERS_DATABASE_PATH=data/app-e2e.db ERS_RESET_DATABASE=true AUTHZ_BOOTSTRAP_ENABLED=true AUTHZ_BOOTSTRAP_ACTOR_KEY=bootstrap-admin AUTHZ_BOOTSTRAP_DISPLAY_NAME='Bootstrap Admin' AUTHZ_BOOTSTRAP_ROLE_CODE=APPLICATION_ADMIN AUTHZ_BOOTSTRAP_TENANT_ID=* make local-backend",
        url: "http://localhost:8080/healthz",
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
      {
        command: "npm run dev -- --host 0.0.0.0 --port 5173",
        url: "http://localhost:5173",
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
    ],});