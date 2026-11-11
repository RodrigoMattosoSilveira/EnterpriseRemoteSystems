import { I18nProvider } from "../../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider, type AuthorizationContextValue } from "../../components/layout/AuthorizationContext";
import { SupportAccessLeasesPage } from "./SupportAccessLeasesPage";

let container: HTMLDivElement;
let root: Root | null;
let calls: Array<{ url: string; method: string }>;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  calls = [];
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("SupportAccessLeasesPage", () => {
  it("shows Portuguese permission descriptions in both request and lease history without altering codes", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/tenants") {
        return jsonResponse({ data: [{ id: "default", code: "DEFAULT", name: "Entidade A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" }] });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url.startsWith("/api/v1/authz/support-access-leases")) {
        return jsonResponse({ data: [{ ...pendingLease, permissions: ["people.read"] }] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });
    renderPage(applicationAdminContext, "pt-BR");
    await clickButton("Solicitar acesso de suporte à Entidade");
    await waitForText("Consultar Pessoas");
    expect(container.textContent).toContain("Consultar os registros de Pessoas da Entidade.");
    expect(container.textContent).toContain("people.read");
    expect(container.textContent).not.toContain("Read Tenant People.");
    await clickButton("Histórico de concessões");
    await waitForText("Consultar Pessoas");
    expect(container.textContent).toContain("Consultar os registros de Pessoas da Entidade.");
    expect(container.textContent).toContain("people.read");
  });

  it("gives the Global Application Administrator a backend-owned request catalog and retained history", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/tenants") {
        return jsonResponse({ data: [{ id: "default", code: "DEFAULT", name: "Tenant A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" }] });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url.startsWith("/api/v1/authz/support-access-leases")) {
        return jsonResponse({ data: [pendingLease] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminContext);

    await waitForText("Request Tenant support access");
    await waitForText("Lease history");
    expect(container.textContent).not.toContain("Read People");
    expect(container.textContent).not.toContain("lease-pending");

    await clickButton("Request Tenant support access");
    await waitForText("Read People");
    expect(container.textContent).toContain("Control-plane and Tenant Administrator authority cannot be leased");

    await clickButton("Lease history");
    await waitForText("lease-pending");
    expect(container.querySelector("#support-access-request-panel")).toBeNull();
    expect(container.querySelector("#support-access-history-panel")).not.toBeNull();
  });

  it("shows every active Tenant initially and filters the request picker by name, code, or ID", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/tenants") {
        return jsonResponse({
          data: [
            { id: "default", code: "ALPHA", name: "Tenant A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
            { id: "north-support", code: "NSUP", name: "North Support", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
            { id: "inactive-tenant", code: "INACTIVE", name: "Inactive Tenant", active: false, operationalStatus: "INACTIVE", tenantAdminCount: 0, createdAt: "", updatedAt: "" },
          ],
        });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url.startsWith("/api/v1/authz/support-access-leases")) {
        return jsonResponse({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminContext);

    await clickButton("Request Tenant support access");
    await waitForText("2 active Tenants");
    expect(tenantChoicesText()).toContain("Tenant A");
    expect(tenantChoicesText()).toContain("North Support");
    expect(tenantChoicesText()).not.toContain("Inactive Tenant");

    await setSearchInput("Tenant A");
    await waitForText("1 of 2 active Tenants");
    expect(tenantChoicesText()).toContain("Tenant A");
    expect(tenantChoicesText()).not.toContain("North Support");

    await setSearchInput("NSUP");
    await waitFor(() => tenantChoicesText().includes("North Support"));
    expect(tenantChoicesText()).not.toContain("Tenant A");

    await setSearchInput("north-support");
    await waitFor(() => tenantChoicesText().includes("North Support"));
    expect(tenantChoicesText()).not.toContain("Tenant A");

    const northChoice = container.querySelector('input[name="support-access-tenant"][value="north-support"]') as HTMLInputElement | null;
    expect(northChoice).not.toBeNull();
    await act(async () => northChoice?.click());
    expect(northChoice?.checked).toBe(true);
    await waitForText("Selected: North Support");

    await setSearchInput("default");
    await waitFor(() => tenantChoicesText().includes("Tenant A"));
    expect(tenantChoicesText()).not.toContain("North Support");
    await waitForText("Selected: North Support");

    await clickButton("Clear filter");
    await waitFor(() => tenantChoicesText().includes("Tenant A") && tenantChoicesText().includes("North Support"));
    const restoredNorthChoice = container.querySelector('input[name="support-access-tenant"][value="north-support"]') as HTMLInputElement | null;
    expect(restoredNorthChoice?.checked).toBe(true);
  });

  it("keeps Request support access disabled until a permission is selected, locks immediately on submit, and resets after success", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    let submittedBody: Record<string, unknown> | undefined;

    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/tenants") {
        return jsonResponse({
          data: [
            { id: "default", code: "ALPHA", name: "Tenant A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
          ],
        });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url === "/api/v1/authz/support-access-leases" && init?.method === "POST") {
        submittedBody = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
        return new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        });
      }
      if (url === "/api/v1/authz/support-access-leases") {
        return jsonResponse({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminContext);

    await clickButton("Request Tenant support access");
    await waitForText("Read People");

    const submitButton = requestSubmitButton();
    expect(submitButton?.disabled).toBe(true);

    const tenantChoice = container.querySelector(
      'input[name="support-access-tenant"][value="default"]',
    ) as HTMLInputElement | null;
    expect(tenantChoice).not.toBeNull();
    await act(async () => tenantChoice?.click());
    await setSupportReason("Investigate Tenant support incident");

    expect(requestSubmitButton()?.disabled).toBe(true);

    const permissionChoice = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(permissionChoice).not.toBeNull();
    await act(async () => permissionChoice?.click());
    await waitFor(() => requestSubmitButton()?.disabled === false);

    const expirationBeforeSubmit = fixedExpirationInput()?.value ?? "";
    expect(new Date(expirationBeforeSubmit).getTime()).toBeGreaterThan(Date.now());

    await act(async () => requestSubmitButton()?.click());
    await waitFor(() => requestSubmitButton()?.disabled === true);
    expect(requestSubmitButton()?.textContent).toContain("Requesting…");
    expect(calls.filter((call) => call.url === "/api/v1/authz/support-access-leases" && call.method === "POST")).toHaveLength(1);
    expect(submittedBody).toMatchObject({
      tenantId: "default",
      reason: "Investigate Tenant support incident",
      permissions: ["people.read"],
    });

    await act(async () => {
      resolveRequest?.(jsonResponse({
        data: {
          ...pendingLease,
          reason: "Investigate Tenant support incident",
          expiresAt: submittedBody?.expiresAt,
        },
      }));
    });

    await waitFor(() => requestSubmitButton()?.textContent?.includes("Request support access") === true);
    expect(requestSubmitButton()?.disabled).toBe(true);
    expect(tenantChoice?.checked).toBe(false);
    expect(supportReasonInput()?.value).toBe("");
    expect(permissionChoice?.checked).toBe(false);
    expect(container.textContent).not.toContain("Selected: Tenant A");

    const resetExpiration = fixedExpirationInput()?.value ?? "";
    const resetTime = new Date(resetExpiration).getTime();
    expect(Number.isFinite(resetTime)).toBe(true);
    expect(Math.abs(Date.now() - resetTime)).toBeLessThanOrEqual(60_000);
  });

  it("shows duplicate open support-access requests in a modal instead of the inline error panel", async () => {
    const conflictMessage =
      "An open Tenant Support Access Lease already exists for this Application Administrator and Tenant";

    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/tenants") {
        return jsonResponse({
          data: [
            { id: "default", code: "ALPHA", name: "Tenant A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
          ],
        });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url === "/api/v1/authz/support-access-leases" && init?.method === "POST") {
        return jsonResponse(
          {
            error: {
              code: "support_access_lease_conflict",
              message: conflictMessage,
            },
          },
          { status: 409 },
        );
      }
      if (url === "/api/v1/authz/support-access-leases") {
        return jsonResponse({ data: [pendingLease] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminContext);

    await clickButton("Request Tenant support access");
    await waitForText("Read People");

    const tenantChoice = container.querySelector(
      'input[name="support-access-tenant"][value="default"]',
    ) as HTMLInputElement | null;
    const permissionChoice = container.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement | null;
    expect(tenantChoice).not.toBeNull();
    expect(permissionChoice).not.toBeNull();

    await act(async () => tenantChoice?.click());
    await setSupportReason("Investigate Tenant support incident");
    await act(async () => permissionChoice?.click());
    await waitFor(() => requestSubmitButton()?.disabled === false);

    await act(async () => requestSubmitButton()?.click());

    await waitFor(() => container.querySelector('[role="alertdialog"]') !== null);
    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("Support access request already open");
    expect(dialog?.textContent).toContain(conflictMessage);
    expect(container.textContent).not.toContain("Status: 409");

    expect(tenantChoice?.checked).toBe(true);
    expect(supportReasonInput()?.value).toBe("Investigate Tenant support incident");
    expect(permissionChoice?.checked).toBe(true);
    await waitFor(() => requestSubmitButton()?.disabled === false);

    await clickButton("Close");
    await waitFor(() => container.querySelector('[role="alertdialog"]') === null);

    expect(tenantChoice?.checked).toBe(true);
    expect(supportReasonInput()?.value).toBe("Investigate Tenant support incident");
    expect(permissionChoice?.checked).toBe(true);
  });

  it("opens the Lease history Tenant choices from the filter and narrows them as the user types", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/tenants") {
        return jsonResponse({
          data: [
            { id: "default", code: "ALPHA", name: "Tenant A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
            { id: "north-support", code: "NSUP", name: "North Support", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
            { id: "inactive-tenant", code: "INACTIVE", name: "Inactive Tenant", active: false, operationalStatus: "INACTIVE", tenantAdminCount: 0, createdAt: "", updatedAt: "" },
          ],
        });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url.startsWith("/api/v1/authz/support-access-leases")) {
        return jsonResponse({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminContext);

    await clickButton("Lease history");
    await waitFor(() => historyTenantFilterInput()?.placeholder === "All Tenants");
    expect(historyTenantChoicesText()).toBe("");

    await openHistoryTenantFilter();
    await waitFor(() =>
      historyTenantChoicesText().includes("Tenant A")
      && historyTenantChoicesText().includes("North Support"),
    );
    expect(historyTenantChoicesText()).toContain("All Tenants");
    expect(historyTenantChoicesText()).toContain("Tenant A");
    expect(historyTenantChoicesText()).toContain("North Support");
    expect(historyTenantChoicesText()).not.toContain("Inactive Tenant");

    await setHistoryTenantSearchInput("North Support");
    await waitForText("1 of 2 active Tenants");
    expect(historyTenantChoicesText()).toContain("North Support");
    expect(historyTenantChoicesText()).not.toContain("Tenant A");
    expect(historyTenantChoicesText()).not.toContain("All Tenants");

    await setHistoryTenantSearchInput("NSUP");
    await waitFor(() => historyTenantChoicesText().includes("North Support"));
    expect(historyTenantChoicesText()).not.toContain("Tenant A");

    await setHistoryTenantSearchInput("north-support");
    await waitFor(() => historyTenantChoicesText().includes("North Support"));
    const northChoice = container.querySelector(
      '[role="listbox"][aria-label="Lease history Tenant choices"] [role="option"][data-tenant-id="north-support"]',
    ) as HTMLButtonElement | null;
    expect(northChoice).not.toBeNull();
    await act(async () => northChoice?.click());
    await waitFor(() => historyTenantChoicesText() === "");
    await waitFor(() => historyTenantFilterInput()?.placeholder === "North Support (NSUP)");
    await waitFor(() => calls.some((call) => call.url.includes("tenantId=north-support")));

    await openHistoryTenantFilter();
    await waitFor(() =>
      historyTenantChoicesText().includes("Tenant A")
      && historyTenantChoicesText().includes("North Support"),
    );
    expect(historyTenantChoicesText()).toContain("All Tenants");

    await setHistoryTenantSearchInput("default");
    await waitFor(() => historyTenantChoicesText().includes("Tenant A"));
    expect(historyTenantChoicesText()).not.toContain("North Support");
    expect(historyTenantChoicesText()).not.toContain("All Tenants");

    const tenantAChoice = container.querySelector(
      '[role="listbox"][aria-label="Lease history Tenant choices"] [role="option"][data-tenant-id="default"]',
    ) as HTMLButtonElement | null;
    expect(tenantAChoice).not.toBeNull();
    await act(async () => tenantAChoice?.click());
    await waitFor(() => historyTenantFilterInput()?.placeholder === "Tenant A (ALPHA)");
    await waitFor(() => calls.some((call) => call.url.includes("tenantId=default")));

    const callCountBeforeAllTenants = calls.length;
    await openHistoryTenantFilter();
    const allTenantsChoice = container.querySelector(
      '[role="listbox"][aria-label="Lease history Tenant choices"] [role="option"][data-tenant-id=""]',
    ) as HTMLButtonElement | null;
    expect(allTenantsChoice).not.toBeNull();
    await act(async () => allTenantsChoice?.click());
    await waitFor(() => historyTenantFilterInput()?.placeholder === "All Tenants");
    await waitFor(() => calls.slice(callCountBeforeAllTenants).some((call) =>
      call.url === "/api/v1/authz/support-access-leases",
    ));
  });

  it("filters Pending Lease history without exposing a non-array query result to the renderer", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/tenants") {
        return jsonResponse({
          data: [
            { id: "default", code: "ALPHA", name: "Tenant A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
          ],
        });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url === "/api/v1/authz/support-access-leases?status=PENDING") {
        // Reproduce the successful non-array payload that previously reached
        // React Query and crashed `(leasesQuery.data ?? []).map(...)`.
        return jsonResponse({ data: { data: [pendingLease] } });
      }
      if (url === "/api/v1/authz/support-access-leases") {
        return jsonResponse({ data: [] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminContext);

    await clickButton("Lease history");
    await selectHistoryStatus("PENDING");
    await waitFor(() => calls.some((call) => call.url === "/api/v1/authz/support-access-leases?status=PENDING"));
    await waitForText("lease-pending");

    expect(container.querySelector("#support-access-history-panel")).not.toBeNull();
    expect(container.textContent).toContain("Pending");
  });

  it("opens with both cards collapsed and keeps only one Support access card open at a time", async () => {
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/tenants") {
        return jsonResponse({
          data: [
            { id: "default", code: "ALPHA", name: "Tenant A", active: true, operationalStatus: "ACTIVE_READY", tenantAdminCount: 1, createdAt: "", updatedAt: "" },
          ],
        });
      }
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url.startsWith("/api/v1/authz/support-access-leases")) {
        return jsonResponse({ data: [pendingLease] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(applicationAdminContext);

    const requestButton = panelButton("Request Tenant support access");
    const historyButton = panelButton("Lease history");
    expect(requestButton?.getAttribute("aria-expanded")).toBe("false");
    expect(historyButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("Support reason / case");
    expect(container.textContent).not.toContain("lease-pending");

    await act(async () => requestButton?.click());
    await waitForText("Support reason / case");
    expect(requestButton?.getAttribute("aria-expanded")).toBe("true");
    expect(historyButton?.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("lease-pending");

    await act(async () => historyButton?.click());
    await waitForText("lease-pending");
    expect(requestButton?.getAttribute("aria-expanded")).toBe("false");
    expect(historyButton?.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).not.toContain("Support reason / case");

    await act(async () => historyButton?.click());
    await waitFor(() => historyButton?.getAttribute("aria-expanded") === "false");
    expect(container.textContent).not.toContain("lease-pending");
  });

  it("lets the exact Tenant Administrator approve a non-expired pending lease and review its audit trail", async () => {
    let approved = false;
    mockFetch(async (url, init) => {
      calls.push({ url, method: init?.method?.toUpperCase() ?? "GET" });
      if (url === "/api/v1/authz/support-access-leases/eligible-permissions") {
        return jsonResponse({ data: [{ code: "people.read", label: "Read People", description: "Read Tenant People." }] });
      }
      if (url === "/api/v1/authz/support-access-leases/lease-pending/approve" && init?.method === "POST") {
        approved = true;
        return jsonResponse({ data: { ...pendingLease, status: "APPROVED", effectiveStatus: "APPROVED", approvedByActorId: "tenant-admin-actor" } });
      }
      if (url === "/api/v1/authz/support-access-leases/lease-pending/audit-logs") {
        return jsonResponse({ data: [{ id: "audit-1", occurredAt: "2026-09-07T12:00:00Z", actorId: "bootstrap-admin", tenantId: "default", supportLeaseId: "lease-pending", operation: "support_access_leases.request", decision: "AUTHORIZED", requestMethod: "POST", requestPath: "/api/v1/authz/support-access-leases" }] });
      }
      if (url.startsWith("/api/v1/authz/support-access-leases")) {
        return jsonResponse({ data: [pendingLease] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage(tenantAdminContext);

    await waitForText("Tenant boundary: Tenant A");
    await clickButton("Lease history");
    await waitForText("Approve support access");
    await clickButton("Review audit trail");
    await waitForText("support_access_leases.request");
    await clickButton("Approve support access");
    await waitFor(() => approved);
    await waitForText("Tenant Support Access request approved");

    const successDialog = container.querySelector('[role="alertdialog"]');
    expect(successDialog?.getAttribute("aria-modal")).toBe("true");
    expect(successDialog?.textContent).toContain("Tenant Support Access Lease lease-pending was approved.");
    expect(calls.some((call) => call.url.endsWith("/lease-pending/approve") && call.method === "POST")).toBe(true);

    await clickButton("Continue");
    await waitFor(() => container.querySelector('[role="alertdialog"]') === null);
  });
});

const pendingLease = {
  id: "lease-pending",
  tenantId: "default",
  applicationActorId: "actor-bootstrap-admin",
  requestedByActorId: "actor-bootstrap-admin",
  requestedAt: "2026-09-07T12:00:00Z",
  expiresAt: "2099-09-07T13:00:00Z",
  reason: "Investigate Tenant support incident",
  status: "PENDING",
  effectiveStatus: "PENDING",
  permissions: ["people.read"],
};

const applicationAdminContext: AuthorizationContextValue = {
  actorKey: "bootstrap-admin",
  actorRecordId: "actor-bootstrap-admin",
  tenantId: "*",
  scope: "APPLICATION",
  roleCodes: ["APPLICATION_ADMIN"],
  permissions: ["support_access_leases.read", "support_access_leases.request", "tenants.read"],
  supportLeasePermissions: [],
  selectedTenantName: "Global administration",
  selectedTenantCode: "GLOBAL",
};

const tenantAdminContext: AuthorizationContextValue = {
  actorKey: "tenant-admin",
  actorRecordId: "tenant-admin-actor",
  tenantId: "default",
  scope: "TENANT",
  roleCodes: ["TENANT_ADMIN"],
  permissions: ["support_access_leases.read", "support_access_leases.approve", "support_access_leases.terminate"],
  supportLeasePermissions: [],
  selectedTenantName: "Tenant A",
  selectedTenantCode: "DEFAULT",
};

function renderPage(actor: AuthorizationContextValue, locale: "en-US" | "pt-BR" = "en-US") {
  window.localStorage.setItem("ers.i18n.locale", locale);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  act(() => {
    root = createRoot(container);
    root.render(
      <I18nProvider><QueryClientProvider client={queryClient}>
        <AuthorizationProvider value={actor}>
          <SupportAccessLeasesPage />
        </AuthorizationProvider>
      </QueryClientProvider></I18nProvider>,
    );
  });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }));
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

async function waitForText(text: string) {
  await waitFor(() => Boolean(textNode(text)));
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("Condition not reached");
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("*")).find((element) => element.textContent?.includes(text));
}


function tenantChoicesText() {
  return container.querySelector('[role="radiogroup"][aria-label="Tenant choices"]')?.textContent ?? "";
}


function historyTenantChoicesText() {
  return container.querySelector('[role="listbox"][aria-label="Lease history Tenant choices"]')?.textContent ?? "";
}

function historyTenantFilterInput() {
  return container.querySelector(
    'input[role="combobox"][aria-label="Lease history Tenant filter"]',
  ) as HTMLInputElement | null;
}

async function openHistoryTenantFilter() {
  const input = historyTenantFilterInput();
  if (!input) throw new Error("Lease history Tenant filter input not found");
  await act(async () => {
    input.focus();
    input.click();
  });
}

async function setHistoryTenantSearchInput(value: string) {
  const input = historyTenantFilterInput();
  if (!input) throw new Error("Lease history Tenant filter input not found");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function setSearchInput(value: string) {
  const input = Array.from(container.querySelectorAll('input[type="search"]')).find((element) => {
    const label = element.closest("label");
    return label?.textContent?.includes("Filter tenants");
  }) as HTMLInputElement | undefined;
  if (!input) throw new Error("Filter tenants input not found");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function requestSubmitButton() {
  return container.querySelector(
    '#support-access-request-panel button[type="submit"]',
  ) as HTMLButtonElement | null;
}

function supportReasonInput() {
  return Array.from(container.querySelectorAll("textarea")).find((element) =>
    element.closest("label")?.textContent?.includes("Support reason / case"),
  ) as HTMLTextAreaElement | undefined;
}

async function setSupportReason(value: string) {
  const input = supportReasonInput();
  if (!input) throw new Error("Support reason input not found");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function fixedExpirationInput() {
  return container.querySelector(
    '#support-access-request-panel input[type="datetime-local"]',
  ) as HTMLInputElement | null;
}

async function selectHistoryStatus(value: string) {
  const select = Array.from(container.querySelectorAll("select")).find((element) => {
    const label = element.closest("label");
    return label?.textContent?.includes("Status");
  }) as HTMLSelectElement | undefined;
  if (!select) throw new Error("Lease history Status select not found");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function panelButton(name: string) {
  return Array.from(container.querySelectorAll("button")).find(
    (element) => element.textContent?.includes(name) && element.hasAttribute("aria-expanded"),
  ) as HTMLButtonElement | undefined;
}

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) => element.textContent?.includes(name)) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Button not found: ${name}`);
  await act(async () => button.click());
}
