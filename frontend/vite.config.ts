import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {
  DEFAULT_SESSION_COOKIE_NAME,
  LOCAL_SESSION_TOKEN_HEADER,
  firstHeaderValue,
  isPrivateLanHost,
  replaceSessionCookie,
  sessionTokenFromSetCookie,
} from "./src/dev/localSessionProxy";

declare const process: {
  env: Record<string, string | undefined>;
};

const e2eAuthzProxyEnabled = process.env.ERS_E2E_AUTHZ_PROXY === "true";
const e2eAuthzActorId = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
const e2eAuthzTenantId = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID ?? "default";
const localBootstrapProxyEnabled = process.env.ERS_LOCAL_AUTHZ_BOOTSTRAP === "true";
const localBootstrapActorId = process.env.ERS_LOCAL_AUTHZ_ACTOR_ID ?? "bootstrap-admin";
const apiProxyTarget = process.env.ERS_API_PROXY_TARGET ?? "http://127.0.0.1:8080";
const localSessionCookieName =
  process.env.ERS_LOCAL_SESSION_COOKIE_NAME ?? DEFAULT_SESSION_COOKIE_NAME;

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
            const privateLanRequest = isPrivateLanHost(req.headers.host ?? "");

            // A physical phone reaches LOCAL through an HTTP private-LAN host.
            // Mark those proxied requests so the backend can retain its existing
            // LOCAL-only compatibility guard. Never trust a marker sent by the
            // browser itself.
            proxyReq.removeHeader("X-ERS-Local-LAN-Proxy");
            if (privateLanRequest) {
              proxyReq.setHeader("X-ERS-Local-LAN-Proxy", "1");
            }

            // The mobile browser has repeatedly demonstrated that it can reject
            // or retain the wrong Set-Cookie value on this insecure LAN origin.
            // Keep the browser-side token in sessionStorage, but translate that
            // token back into the canonical ERS cookie before the request reaches
            // the backend. The backend therefore authenticates exactly as it does
            // everywhere else and does not depend on mobile-specific header
            // precedence. This bridge exists only inside the Vite dev proxy.
            const localSessionToken = firstHeaderValue(
              req.headers[LOCAL_SESSION_TOKEN_HEADER.toLowerCase()],
            );
            proxyReq.removeHeader(LOCAL_SESSION_TOKEN_HEADER);
            if (privateLanRequest && localSessionToken) {
              proxyReq.setHeader(
                "Cookie",
                replaceSessionCookie(
                  firstHeaderValue(req.headers.cookie),
                  localSessionToken,
                  localSessionCookieName,
                ),
              );
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
          proxy.on("proxyRes", (proxyRes, req) => {
            if (!isPrivateLanHost(req.headers.host ?? "")) return;

            // Capture the ordinary backend session cookie before the physical
            // mobile browser decides whether to persist it. Expose only the raw
            // session token to this same-origin LOCAL SPA so client.ts can keep
            // it in tab-scoped sessionStorage. The Set-Cookie header is left
            // intact: browsers that accept the canonical cookie continue to use
            // it normally, while browsers that do not can use the Vite bridge.
            const token = sessionTokenFromSetCookie(
              proxyRes.headers["set-cookie"],
              localSessionCookieName,
            );
            if (token) {
              proxyRes.headers[LOCAL_SESSION_TOKEN_HEADER.toLowerCase()] = token;
            }
          });

        },
      },
    },
  },
});
