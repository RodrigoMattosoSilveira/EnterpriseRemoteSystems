import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiFetch,
  ApiError,
  LOCAL_SESSION_STORAGE_KEY,
  localSessionTokenForRequest,
  shouldUseLocalSessionTransport,
  syncLocalSessionTransportResponse,
} from "./client";
import { SELECTED_TENANT_STORAGE_KEY } from "./tenantSelection";
import {
  subscribeAuthenticationRequired,
  subscribeForbidden,
  subscribeTenantActorUnavailable,
} from "../app/authEvents";

type FetchCall = {
  url: string | URL | Request;
  init?: RequestInit;
};

const fetchCalls: FetchCall[] = [];

beforeEach(() => {
  fetchCalls.length = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("apiFetch authenticated-session transport", () => {

  it("limits the LOCAL session-header transport to private-LAN HTTP origins", () => {
    expect(
      shouldUseLocalSessionTransport({ protocol: "http:", hostname: "192.168.2.154" }),
    ).toBe(true);
    expect(
      shouldUseLocalSessionTransport({ protocol: "http:", hostname: "10.0.0.22" }),
    ).toBe(true);
    expect(
      shouldUseLocalSessionTransport({ protocol: "http:", hostname: "172.20.4.7" }),
    ).toBe(true);
    expect(
      shouldUseLocalSessionTransport({ protocol: "http:", hostname: "localhost" }),
    ).toBe(false);
    expect(
      shouldUseLocalSessionTransport({ protocol: "https:", hostname: "192.168.2.154" }),
    ).toBe(false);
  });

  it("stores, reuses, and clears the LOCAL session token without exposing it outside the LAN origin", () => {
    const location = { protocol: "http:", hostname: "192.168.2.154" };
    const issued = new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { "X-ERS-Local-Session": "local-session-token" },
    });

    syncLocalSessionTransportResponse(issued, location, window.sessionStorage);
    expect(window.sessionStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBe(
      "local-session-token",
    );
    expect(localSessionTokenForRequest(location, window.sessionStorage)).toBe(
      "local-session-token",
    );
    expect(
      localSessionTokenForRequest(
        { protocol: "https:", hostname: "192.168.2.154" },
        window.sessionStorage,
      ),
    ).toBe("");

    syncLocalSessionTransportResponse(
      new Response(JSON.stringify({ error: { code: "authentication_required" } }), {
        status: 401,
      }),
      location,
      window.sessionStorage,
      "local-session-token",
    );
    expect(window.sessionStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("does not let a stale pre-login 401 erase a newer LOCAL session token", () => {
    const location = { protocol: "http:", hostname: "192.168.2.154" };
    window.sessionStorage.setItem(LOCAL_SESSION_STORAGE_KEY, "new-login-token");

    syncLocalSessionTransportResponse(
      new Response(JSON.stringify({ error: { code: "session_expired" } }), {
        status: 401,
      }),
      location,
      window.sessionStorage,
      "",
    );

    expect(window.sessionStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBe(
      "new-login-token",
    );
  });

  it("does not let an old-token 401 erase a replacement LOCAL session token", () => {
    const location = { protocol: "http:", hostname: "192.168.2.154" };
    window.sessionStorage.setItem(LOCAL_SESSION_STORAGE_KEY, "replacement-token");

    syncLocalSessionTransportResponse(
      new Response(JSON.stringify({ error: { code: "session_expired" } }), {
        status: 401,
      }),
      location,
      window.sessionStorage,
      "older-request-token",
    );

    expect(window.sessionStorage.getItem(LOCAL_SESSION_STORAGE_KEY)).toBe(
      "replacement-token",
    );
  });
  it("sends same-origin cookies and a tenant selection without actor identity headers", async () => {
    await apiFetch<{ ok: boolean }>("/people");

    expect(fetchCalls[0]?.init?.credentials).toBe("same-origin");
    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Actor-ID"]).toBeUndefined();
    expect(headers["X-Authorized-By"]).toBeUndefined();
    expect(headers["X-Actor-Permissions"]).toBeUndefined();
  });

  it("strips caller-supplied actor identity and permission headers", async () => {
    await apiFetch<{ ok: boolean }>("/people", {
      headers: {
        "X-Actor-ID": "spoofed-admin",
        "x-actor-permissions": "*",
        "X-Authorized-By": "spoofed-legacy-actor",
        "X-Tenant-ID": "spoofed-tenant",
        "X-Reauthenticated-At": "2026-07-23T12:00:00Z",
        "X-ERS-Local-LAN-Proxy": "spoofed",
        "X-ERS-Local-Session": "spoofed-token",
      },
    });

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBeUndefined();
    expect(headers["x-actor-permissions"]).toBeUndefined();
    expect(headers["X-Authorized-By"]).toBeUndefined();
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Reauthenticated-At"]).toBe("2026-07-23T12:00:00Z");
    expect(headers["X-ERS-Local-LAN-Proxy"]).toBeUndefined();
    expect(headers["X-ERS-Local-Session"]).toBeUndefined();
  });

  it("uses the explicitly selected tenant", async () => {
    window.localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, "tenant-a");

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Tenant-ID"]).toBe("tenant-a");
    expect(headers["X-Actor-ID"]).toBeUndefined();
  });

  it("broadcasts tenant Actor loss without treating the Account session as unauthenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "tenant_actor_unavailable",
              message:
                "The authenticated account has no active actor for the selected tenant",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    let tenantActorNotifications = 0;
    let authenticationNotifications = 0;
    let forbiddenNotifications = 0;
    const unsubscribeTenantActor = subscribeTenantActorUnavailable(() => {
      tenantActorNotifications += 1;
    });
    const unsubscribeAuthentication = subscribeAuthenticationRequired(() => {
      authenticationNotifications += 1;
    });
    const unsubscribeForbidden = subscribeForbidden(() => {
      forbiddenNotifications += 1;
    });

    try {
      await expect(apiFetch("/people")).rejects.toMatchObject({
        status: 403,
        code: "tenant_actor_unavailable",
      });
      expect(tenantActorNotifications).toBe(1);
      expect(authenticationNotifications).toBe(0);
      expect(forbiddenNotifications).toBe(0);
    } finally {
      unsubscribeTenantActor();
      unsubscribeAuthentication();
      unsubscribeForbidden();
    }
  });

  it("can suppress global forbidden navigation for supplemental queries", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "forbidden",
            message: "Actor is not permitted to perform this operation",
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    let forbiddenNotifications = 0;
    const unsubscribe = subscribeForbidden(() => {
      forbiddenNotifications += 1;
    });

    try {
      await expect(
        apiFetch("/auth/reactivation-requests", {
          suppressForbiddenNavigation: true,
        }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(forbiddenNotifications).toBe(0);

      await expect(apiFetch("/people")).rejects.toBeInstanceOf(ApiError);
      expect(forbiddenNotifications).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it("leaves auth-session 401 handling to the auth store instead of broadcasting globally", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "authentication_required",
              message: "An authenticated session is required",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    let authenticationNotifications = 0;
    const unsubscribe = subscribeAuthenticationRequired(() => {
      authenticationNotifications += 1;
    });

    try {
      await expect(apiFetch("/auth/session")).rejects.toBeInstanceOf(ApiError);
      expect(authenticationNotifications).toBe(0);

      await expect(apiFetch("/people")).rejects.toBeInstanceOf(ApiError);
      expect(authenticationNotifications).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it("treats only the POST self-reactivation request as public", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "authentication_required",
              message: "An authenticated session is required",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    let authenticationNotifications = 0;
    const unsubscribe = subscribeAuthenticationRequired(() => {
      authenticationNotifications += 1;
    });

    try {
      await expect(
        apiFetch("/auth/reactivation-requests", { method: "POST" }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(authenticationNotifications).toBe(0);

      await expect(
        apiFetch("/auth/reactivation-requests", { method: "GET" }),
      ).rejects.toBeInstanceOf(ApiError);
      expect(authenticationNotifications).toBe(1);
    } finally {
      unsubscribe();
    }
  });

  it("does not retry authentication failures with bootstrap actor headers", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return new Response(
        JSON.stringify({
          error: {
            code: "authentication_required",
            message: "An authenticated session is required",
          },
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ ok: boolean }>("/people")).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBeUndefined();
  });
});
