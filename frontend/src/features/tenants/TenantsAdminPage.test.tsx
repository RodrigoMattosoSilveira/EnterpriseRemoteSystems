import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantsAdminPage } from "./TenantsAdminPage";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import type { AuthzCurrentActor } from "../../types/authz";

const tenant = {
  id: "default",
  code: "DEFAULT",
  name: "Default Tenant",
  description: "Default tenant",
  active: true,
  operationalStatus: "ACTIVE_NO_TENANT_ADMIN",
  tenantAdminCount: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const applicationAdminActor: AuthzCurrentActor = {
  actorKey: "bootstrap-admin",
  actorRecordId: "actor-application-admin",
  tenantId: "*",
  scope: "APPLICATION",
  roleCodes: ["APPLICATION_ADMIN"],
  permissions: [
    "authz.self.read",
    "authz.read",
    "authz.manage",
    "tenants.read",
    "tenants.create",
    "tenants.update",
  ],
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

describe("TenantsAdminPage", () => {
  it("renders the Administration and Tenants heading hierarchy", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: parseBody(init?.body) });
      if (url === "/api/v1/tenants" && !init?.method) return json({ data: [tenant] });
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage();
    await waitForText("Default Tenant");

    expect(container.querySelector("h1")?.textContent).toBe("Administration");
    expect(container.querySelector("h2")?.textContent).toBe("Tenants");
    expect(container.textContent).toContain(
      "Create tenant boundaries, monitor operational readiness, and assign tenant administrators.",
    );
  });

  it("lists tenants and creates a tenant", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: parseBody(init?.body) });
      if (url === "/api/v1/tenants" && !init?.method) return json({ data: [tenant] });
      if (url === "/api/v1/tenants" && init?.method === "POST") {
        return json({ data: { ...tenant, id: "north", code: "NORTH", name: "North Site" } }, 201);
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage();
    await waitForText("Default Tenant");
    await setInput("Code", "NORTH");
    await setInput("Name", "North Site");
    await click("Create Tenant");
    await waitForText("North Site created.");

    expect(calls.find((call) => call.method === "POST")?.body).toMatchObject({
      code: "NORTH",
      name: "North Site",
      active: true,
    });
  });

  it("surfaces pending account reactivation requests on the GLOBAL control-plane landing page", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: parseBody(init?.body) });
      if (url === "/api/v1/tenants" && !init?.method) return json({ data: [tenant] });
      if (url === "/api/v1/auth/reactivation-requests" && !init?.method) {
        return json({
          data: [
            {
              id: "reactivation-request-1",
              accountId: "account-1",
              login: "pending@example.test",
              globalPersonName: "Pending Person",
              status: "PENDING",
              requestedByType: "SELF",
              firstRequestedAt: "2026-08-17T15:00:00Z",
              lastRequestedAt: "2026-08-17T15:00:00Z",
              requestCount: 1,
            },
          ],
        });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminActor);
    await waitForText("Account Reactivation Requests");
    await waitForText("1 pending");

    const alert = container.querySelector('[aria-label="Pending account reactivation requests"]');
    expect(alert).toBeTruthy();
    expect(alert?.className).toContain("border-red-500");
    expect(container.textContent).toContain("Authentication");
    expect(container.textContent).toContain("Audit logs");
    expect(container.textContent).not.toContain("Back to People");
  });

  it("keeps the control-plane tenant catalog usable if the supplemental reactivation response is malformed", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: parseBody(init?.body) });
      if (url === "/api/v1/tenants" && !init?.method) return json({ data: [tenant] });
      if (url === "/api/v1/auth/reactivation-requests" && !init?.method) {
        return json({ data: { unexpected: true } });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminActor);
    await waitForText("Default Tenant");
    expect(container.textContent).toContain("Default Tenant");
    expect(
      container.querySelector('[aria-label="Pending account reactivation requests"]'),
    ).toBeFalsy();
  });

  it("does not show a reactivation alert when the Application Administrator has no pending requests", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: parseBody(init?.body) });
      if (url === "/api/v1/tenants" && !init?.method) return json({ data: [tenant] });
      if (url === "/api/v1/auth/reactivation-requests" && !init?.method) {
        return json({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminActor);
    await waitForText("Tenants");
    expect(
      container.querySelector('[aria-label="Pending account reactivation requests"]'),
    ).toBeFalsy();
  });

  it("shows duplicate tenant code errors beneath the Code input", async () => {
    const northTenant = { ...tenant, id: "north", code: "NORTH", name: "North Site" };
    let tenantCreated = false;

    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method ?? "GET", body: parseBody(init?.body) });
      if (url === "/api/v1/tenants" && !init?.method) {
        return json({ data: tenantCreated ? [tenant, northTenant] : [tenant] });
      }
      if (url === "/api/v1/tenants" && init?.method === "POST" && !tenantCreated) {
        tenantCreated = true;
        return json({ data: northTenant }, 201);
      }
      if (url === "/api/v1/tenants" && init?.method === "POST") {
        return json(
          {
            error: {
              code: "validation_error",
              message: "Validation failed",
              fields: { code: "Tenant code must be unique" },
            },
          },
          400,
        );
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage();
    await waitForText("Default Tenant");

    await setInput("Code", "NORTH");
    await setInput("Name", "North Site");
    await click("Create Tenant");
    await waitForText("North Site created.");

    await setInput("Code", "NORTH");
    await setInput("Name", "Duplicate North Site");
    await click("Create Tenant");
    await waitForText("Tenant code must be unique");

    const codeInput = findInput("Code");
    const codeField = codeInput.closest("label");
    const inlineError = codeField?.querySelector('[role="alert"]');
    const catalogCard = findSectionByHeading("Tenant catalog");

    expect(inlineError?.textContent).toContain("Tenant code must be unique");
    expect(codeInput.getAttribute("aria-invalid")).toBe("true");
    expect(codeInput.getAttribute("aria-describedby")).toBe("tenant-code-error");
    expect(catalogCard?.textContent).not.toContain("Tenant code must be unique");
  });
});

function renderPage(actor?: AuthzCurrentActor) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: "/admin/tenants", element: <TenantsAdminPage /> }], { initialEntries: ["/admin/tenants"] });
  root = createRoot(container);
  act(() => root?.render(
    <QueryClientProvider client={client}>
      {actor ? (
        <AuthorizationProvider value={actor}>
          <RouterProvider router={router} />
        </AuthorizationProvider>
      ) : (
        <RouterProvider router={router} />
      )}
    </QueryClientProvider>,
  ));
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

function findInput(label: string) {
  const input = [...container.querySelectorAll("label")].find((node) => node.textContent?.includes(label))?.querySelector("input");
  if (!input) throw new Error(`Input ${label} not found`);
  return input;
}

function findSectionByHeading(heading: string) {
  const headingNode = [...container.querySelectorAll("h2")].find(
    (node) => node.textContent === heading,
  );
  return headingNode?.closest("section");
}

async function setInput(label: string, value: string) {
  const input = findInput(label);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
