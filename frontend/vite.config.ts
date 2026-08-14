import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

declare const process: {
  env: Record<string, string | undefined>;
};

const e2eAuthzProxyEnabled = process.env.ERS_E2E_AUTHZ_PROXY === "true";
const e2eAuthzActorId = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
const e2eAuthzTenantId = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";
const localBootstrapProxyEnabled = process.env.ERS_LOCAL_AUTHZ_BOOTSTRAP === "true";
const localBootstrapActorId = process.env.ERS_LOCAL_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
const apiProxyTarget = process.env.ERS_API_PROXY_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: apiProxyTarget,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            if (e2eAuthzProxyEnabled) {
              proxyReq.setHeader("X-Actor-ID", e2eAuthzActorId);
              proxyReq.setHeader("X-Tenant-ID", e2eAuthzTenantId);
              return;
            }

            // Bite 28D uses login-backed sessions by default. This compatibility
            // path is opt-in for deliberate bootstrap recovery only.
            if (localBootstrapProxyEnabled) {
              proxyReq.setHeader("X-Actor-ID", localBootstrapActorId);
            }
          });
        },
      },
    },
  },
});
