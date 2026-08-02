import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

declare const process: {
  env: Record<string, string | undefined>;
};

const e2eAuthzProxyEnabled = process.env.ERS_E2E_AUTHZ_PROXY === "true";
const e2eAuthzActorId = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
const e2eAuthzTenantId = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";
const localBootstrapProxyEnabled = process.env.ERS_LOCAL_AUTHZ_BOOTSTRAP !== "false";
const localBootstrapActorId = process.env.ERS_LOCAL_AUTHZ_ACTOR_ID ?? "bootstrap-admin";

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
          proxy.on("proxyReq", (proxyReq) => {
            if (e2eAuthzProxyEnabled) {
              proxyReq.setHeader("X-Actor-ID", e2eAuthzActorId);
              proxyReq.setHeader("X-Tenant-ID", e2eAuthzTenantId);
              return;
            }

            // Bite 28C keeps a narrowly scoped local bootstrap escape hatch so
            // the development UI remains usable before Bite 28D adds login UX.
            // Production builds have no Vite proxy, and the backend accepts this
            // header only when AUTHZ_ACTOR_HEADER_MODE=bootstrap.
            if (localBootstrapProxyEnabled) {
              proxyReq.setHeader("X-Actor-ID", localBootstrapActorId);
            }
          });
        },
      },
    },
  },
});
