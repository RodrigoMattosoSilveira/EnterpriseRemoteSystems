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
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
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
    : {
        command: "npm run dev -- --host 0.0.0.0 --port 5173",
        url: "http://localhost:5173",
        reuseExistingServer: !isCI,
        timeout: 120_000,
      },
});