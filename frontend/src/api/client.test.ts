import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./client";

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

describe("apiFetch persisted actor headers", () => {
  it("uses the local development bootstrap actor when no actor is stored", async () => {
    await apiFetch<{ ok: boolean }>("/people");

    expect(fetchCalls[0]?.init?.credentials).toBe("same-origin");
    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Authorized-By"]).toBeUndefined();
    expect(headers["X-Actor-Permissions"]).toBeUndefined();
  });

  it("falls back to the local development bootstrap actor when storage is blank", async () => {
    window.localStorage.setItem("ers.authzAdmin.requestActor", "");

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(headers["X-Tenant-ID"]).toBe("default");
  });

  it("falls back to the local development bootstrap actor when storage is malformed", async () => {
    window.localStorage.setItem("ers.authzAdmin.requestActor", "not-json");

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(headers["X-Tenant-ID"]).toBe("default");
  });

  it("uses a stored actor instead of the local development default", async () => {
    window.localStorage.setItem(
      "ers.authzAdmin.requestActor",
      JSON.stringify({ actorId: "tenant-admin@test.ers", tenantId: "default" }),
    );

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("tenant-admin@test.ers");
    expect(headers["X-Tenant-ID"]).toBe("default");
  });

  it("fills a missing tenant for partially stored local development actors", async () => {
    window.localStorage.setItem(
      "ers.authzAdmin.requestActor",
      JSON.stringify({ actorId: "tenant-admin@test.ers" }),
    );

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("tenant-admin@test.ers");
    expect(headers["X-Tenant-ID"]).toBe("default");
  });

  it("resets a stale local actor and retries with bootstrap-admin when the backend reports a missing actor", async () => {
    window.localStorage.setItem(
      "ers.authzAdmin.requestActor",
      JSON.stringify({ actorId: "atest", tenantId: "default" }),
    );

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      if (fetchCalls.length === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: "missing_actor",
              message: "Authorization actor is required",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ data: { ok: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ ok: boolean }>("/people")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(firstHeaders["X-Actor-ID"]).toBe("atest");
    expect(firstHeaders["X-Tenant-ID"]).toBe("default");

    const retryHeaders = fetchCalls[1]?.init?.headers as Record<string, string>;
    expect(retryHeaders["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(retryHeaders["X-Tenant-ID"]).toBe("default");
    expect(window.localStorage.getItem("ers.authzAdmin.requestActor")).toBe(
      JSON.stringify({ actorId: "bootstrap-admin", tenantId: "default" }),
    );
  });

  it("does not hide forbidden responses by replacing a valid but underprivileged actor", async () => {
    window.localStorage.setItem(
      "ers.authzAdmin.requestActor",
      JSON.stringify({ actorId: "bite27b-person", tenantId: "default" }),
    );

    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      fetchCalls.push({ url, init });
      return new Response(
        JSON.stringify({
          error: {
            code: "forbidden",
            message: "Actor is not permitted to perform this operation",
          },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch<{ ok: boolean }>("/people")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("ers.authzAdmin.requestActor")).toBe(
      JSON.stringify({ actorId: "bite27b-person", tenantId: "default" }),
    );
  });
});
