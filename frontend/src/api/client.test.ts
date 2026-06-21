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

describe("apiFetch temporary authz headers", () => {
  it("uses the local development bootstrap actor when no actor is stored", async () => {
    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(headers["X-Authorized-By"]).toBe("bootstrap-admin");
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Actor-Permissions"]).toBe("*");
  });

  it("falls back to the local development bootstrap actor when storage is blank", async () => {
    window.localStorage.setItem("ers.authzAdmin.requestActor", "");

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(headers["X-Authorized-By"]).toBe("bootstrap-admin");
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Actor-Permissions"]).toBe("*");
  });

  it("falls back to the local development bootstrap actor when storage is malformed", async () => {
    window.localStorage.setItem("ers.authzAdmin.requestActor", "not-json");

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(headers["X-Authorized-By"]).toBe("bootstrap-admin");
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Actor-Permissions"]).toBe("*");
  });

  it("uses a stored actor instead of the local development default", async () => {
    window.localStorage.setItem(
      "ers.authzAdmin.requestActor",
      JSON.stringify({ actorId: "tenant-admin@test.ers", tenantId: "default" }),
    );

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("tenant-admin@test.ers");
    expect(headers["X-Authorized-By"]).toBe("tenant-admin@test.ers");
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Actor-Permissions"]).toBe("*");
  });

  it("fills missing tenant and permissions for partially stored local development actors", async () => {
    window.localStorage.setItem(
      "ers.authzAdmin.requestActor",
      JSON.stringify({ actorId: "tenant-admin@test.ers" }),
    );

    await apiFetch<{ ok: boolean }>("/people");

    const headers = fetchCalls[0]?.init?.headers as Record<string, string>;
    expect(headers["X-Actor-ID"]).toBe("tenant-admin@test.ers");
    expect(headers["X-Authorized-By"]).toBe("tenant-admin@test.ers");
    expect(headers["X-Tenant-ID"]).toBe("default");
    expect(headers["X-Actor-Permissions"]).toBe("*");
  });
});
