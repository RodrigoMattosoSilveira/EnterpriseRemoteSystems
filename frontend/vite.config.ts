import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

declare const process: {
  env: Record<string, string | undefined>;
};

const e2eAuthzProxyEnabled = process.env.ERS_E2E_AUTHZ_PROXY === "true";
const e2eAuthzActorId = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
const e2eAuthzTenantId = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        configure: (proxy) => {
          if (!e2eAuthzProxyEnabled) return;

          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("X-Actor-ID", e2eAuthzActorId);
            proxyReq.setHeader("X-Tenant-ID", e2eAuthzTenantId);
          });
        },
      },
    },
  },
});
