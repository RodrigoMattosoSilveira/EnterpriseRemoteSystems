import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const nodeMajorVersion = Number.parseInt(
  process.versions.node.split(".")[0] ?? "0",
  10,
);

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    execArgv: nodeMajorVersion >= 25 ? ["--no-webstorage"] : [],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/tests/e2e/**",
      "**/*.e2e.*",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
});