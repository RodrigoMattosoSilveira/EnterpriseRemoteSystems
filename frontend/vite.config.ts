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
          proxy.on("proxyReq", (proxyReq, req) => {
            // A physical phone reaches LOCAL through an HTTP private-LAN host.
            // Mark those proxied requests so the backend can permit the LOCAL
            // session-header fallback without exposing that transport to direct
            // LAN clients or deployed environments. Never trust a marker sent
            // by the browser itself.
            proxyReq.removeHeader("X-ERS-Local-LAN-Proxy");
            if (isPrivateLanHost(req.headers.host ?? "")) {
              proxyReq.setHeader("X-ERS-Local-LAN-Proxy", "1");
            }

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

function isPrivateLanHost(hostHeader: string): boolean {
  const hostname = hostHeader.trim().split(":", 1)[0] ?? "";
  const octets = hostname.split(".").map((value) => Number(value));
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}
