import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./client";
import { SELECTED_TENANT_STORAGE_KEY } from "./tenantSelection";
import { subscribeAuthenticationRequired, subscribeForbidden } from "../app/authEvents";

type FetchCall = {
  url: string | URL | Request;
  init?: RequestInit;
};

const fetchCalls: FetchCall[] = [];

beforeEach(() => {
  fetchCalls.length = 0;
  window.localStorage.clear();
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
});

describe("apiFetch authenticated-session transport", () => {
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
      },
    });

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBeUndefined();
    expect(headers["x-actor-permissions"]).toBeUndefined();
    expect(headers["X-Authorized-By"]).toBeUndefined();
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Reauthenticated-At"]).toBe("2026-07-23T12:00:00Z");
  });

  it("uses the explicitly selected tenant", async () => {
    window.localStorage.setItem(SELECTED_TENANT_STORAGE_KEY, "tenant-a");

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Tenant-ID"]).toBe("tenant-a");
    expect(headers["X-Actor-ID"]).toBeUndefined();
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
