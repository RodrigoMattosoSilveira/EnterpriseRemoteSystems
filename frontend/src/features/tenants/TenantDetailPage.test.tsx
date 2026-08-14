import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantDetailPage } from "./TenantDetailPage";

const tenant = {
  id: "north",
  code: "NORTH",
  name: "North Site",
  description: "Northern operation",
  active: true,
  operationalStatus: "ACTIVE_NO_TENANT_ADMIN",
  tenantAdminCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const candidate = {
  actorId: "actor-north-admin",
  actorKey: "north-admin@example.com",
  displayName: "North Admin",
  active: true,
  assigned: false,
};

let container: HTMLDivElement;
let root: Root | null;
let calls: Array<{ url: string; method: string; body?: unknown }>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  calls = [];
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("TenantDetailPage", () => {
  it("assigns a tenant administrator and deactivates the tenant", async () => {
    let assigned = false;
    let active = true;
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: parseBody(init?.body) });
      if (url === "/api/v1/tenants/north" && !init?.method) {
        return json({ data: { ...tenant, active, operationalStatus: active ? (assigned ? "ACTIVE_READY" : "ACTIVE_NO_TENANT_ADMIN") : "INACTIVE", tenantAdminCount: assigned ? 1 : 0 } });
      }
      if (url === "/api/v1/tenants/north/admin-candidates" && !init?.method) {
        return json({ data: [{ ...candidate, assigned }] });
      }
      if (url === "/api/v1/tenants/north/admins" && init?.method === "POST") {
        assigned = true;
        return json({ data: { ...tenant, tenantAdminCount: 1, operationalStatus: "ACTIVE_READY" } });
      }
      if (url === "/api/v1/tenants/north/active" && init?.method === "PATCH") {
        active = false;
        return json({ data: { ...tenant, active: false, operationalStatus: "INACTIVE", tenantAdminCount: assigned ? 1 : 0 } });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage();
    await waitForText("North Site");
    await changeSelect("Select an active actor", candidate.actorId);
    await click("Assign Admin");
    await waitForText("North Admin assigned as tenant administrator.");
    expect(calls.find((call) => call.url.endsWith("/admins") && call.method === "POST")?.body).toEqual({ actorId: candidate.actorId });

    await waitForText("Tenant access verification");
    expect(container.textContent).toContain("Tenant IDnorth");
    expect(container.textContent).toContain("Tenant codeNORTH");
    expect(container.textContent).toContain("Actor key: north-admin@example.com");
    expect(container.textContent).toContain("Do not");
    const verificationCommand = container.querySelector(
      '[aria-label="Tenant access curl command for north-admin@example.com"]',
    );
    expect(verificationCommand?.textContent).toContain('-b /tmp/ers-session.cookies');
    expect(verificationCommand?.textContent).not.toContain('X-Actor-ID');
    expect(verificationCommand?.textContent).toContain('X-Tenant-ID: north');
    expect(verificationCommand?.textContent).toContain('/api/v1/tenants/north');
    expect(verificationCommand?.textContent).not.toContain('X-Tenant-ID: NORTH');

    await click("Deactivate Tenant");
    await waitForText("North Site deactivated.");
    expect(calls.some((call) => call.url.endsWith("/active") && call.method === "PATCH")).toBe(true);
  });
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: "/admin/tenants/:id", element: <TenantDetailPage /> }], { initialEntries: ["/admin/tenants/north"] });
  root = createRoot(container);
  act(() => root?.render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>));
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => handler(input.toString(), init));
}

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function parseBody(body: BodyInit | null | undefined) {
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

async function changeSelect(optionText: string, value: string) {
  const select = [...container.querySelectorAll("select")].find((node) => node.textContent?.includes(optionText));
  if (!select) throw new Error(`Select ${optionText} not found`);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((node) => node.textContent?.includes(text));
  if (!button) throw new Error(`Button ${text} not found`);
  await act(async () => button.click());
}

async function waitForText(text: string) {
  const timeout = Date.now() + 1500;
  while (Date.now() < timeout) {
    if (container.textContent?.includes(text)) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`Timed out waiting for ${text}`);
}
