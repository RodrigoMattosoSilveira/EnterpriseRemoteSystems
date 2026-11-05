import { I18nProvider } from "../../i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditLogViewerPage } from "./AuditLogViewerPage";
import type { AuthzAuditLog } from "../../types/authz";

const auditLogs: AuthzAuditLog[] = [
  {
    id: "audit-partial-payout-1",
    occurredAt: "2026-06-22T14:00:00Z",
    accountId: "account-bootstrap-admin",
    actorId: "bootstrap-admin",
    actorRecordId: "actor-bootstrap-admin",
    actorScope: "APPLICATION",
    tenantId: "default",
    sessionId: "session-bootstrap-admin",
    correlationId: "correlation-partial-payout",
    permissionCode: "journey_settlements.partial_payout",
    authorizationSource: "GLOBAL_CONTROL_PLANE",
    authorizationSourceId: "grant-bootstrap-admin",
    authorizationRoleCode: "APPLICATION_ADMIN",
    supportLeaseId: "lease-support-a",
    operation: "current_accounts.partial_payout",
    targetType: "collaborator",
    targetId: "collab-123",
    decision: "AUTHORIZED",
    metadataJson: JSON.stringify({
      reasonCode: "COLLABORATOR_REQUESTED_PAYOUT",
      reasonText: "Collaborator requested payout.",
      recentReauthentication: {
        authenticatedAt: "2026-06-22T13:59:00Z",
        method: "password",
      },
      secondApproval: {
        approvedBy: "second-admin@example.com",
        notes: "Reviewed current-account balance.",
      },
    }),
    requestMethod: "POST",
    requestPath: "/api/v1/collaborators/collab-123/payout",
  },
  {
    id: "audit-denied-reversal-1",
    occurredAt: "2026-06-22T13:00:00Z",
    actorId: "expense-operator@example.com",
    tenantId: "default",
    permissionCode: "ledger.corrections.create",
    operation: "ledger_entries.reverse",
    targetType: "ledger_entry",
    targetId: "entry-123",
    decision: "DENIED",
    reason: "recent reauthentication is required",
    requestMethod: "POST",
    requestPath: "/api/v1/current-accounts/ledger-entries/entry-123/reverse",
  },
];

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
};

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: FetchCall[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchCalls = [];
  window.localStorage.clear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("AuditLogViewerPage", () => {
  it("loads sensitive audit events with the selected tenant and session credentials", async () => {
    mockAuditFetch(auditLogs);

    renderPage();

    await waitForText("Audit Log Viewer");
    await waitForText("Partial payout");
    await waitForText("AUTHORIZED");
    await waitForText("COLLABORATOR_REQUESTED_PAYOUT");
    await waitForText("second-admin@example.com");
    await waitForText("recent reauthentication is required");
    await waitForText("account-bootstrap-admin");
    await waitForText("session-bootstrap-admin");
    await waitForText("correlation-partial-payout");
    await waitForText("GLOBAL_CONTROL_PLANE · APPLICATION_ADMIN · grant-bootstrap-admin");

    const getCall = fetchCalls.find((call) => call.url.startsWith("/api/v1/authz/audit-logs"));
    expect(getCall?.headers["X-Actor-ID"]).toBeUndefined();
    expect(getCall?.headers["X-Tenant-ID"]).toBe("default");
  });

  it("renders evidence on a full-width second row for every audit event", async () => {
    mockAuditFetch(auditLogs);
    renderPage();

    await waitForText("COLLABORATOR_REQUESTED_PAYOUT");

    const summaryRows = container.querySelectorAll('tr[data-testid="audit-log-row"]');
    const evidenceRows = container.querySelectorAll('tr[data-testid="audit-log-evidence-row"]');
    expect(summaryRows).toHaveLength(auditLogs.length);
    expect(evidenceRows).toHaveLength(auditLogs.length);

    summaryRows.forEach((summaryRow, index) => {
      expect((summaryRow as HTMLTableRowElement).cells).toHaveLength(5);
      const evidenceRow = evidenceRows[index] as HTMLTableRowElement;
      expect(summaryRow.nextElementSibling).toBe(evidenceRow);
      expect(evidenceRow.cells).toHaveLength(1);
      expect(evidenceRow.cells[0].colSpan).toBe(5);
      expect(evidenceRow.textContent).toContain("Evidence");
    });

    expect(evidenceRows[0].textContent).toContain("account-bootstrap-admin");
    expect(evidenceRows[0].textContent).toContain("COLLABORATOR_REQUESTED_PAYOUT");
    expect(evidenceRows[0].querySelector("details summary")?.textContent).toContain("Raw metadata");
    expect(evidenceRows[1].textContent).toContain("recent reauthentication is required");
  });

  it("applies operation and decision filters", async () => {
    mockAuditFetch(auditLogs);

    renderPage();

    await waitForText("Partial payout");
    await changeSelect("Operation", "ledger_entries.reverse");
    await changeSelect("Decision", "DENIED");
    await clickButton("Apply Filters");

    await waitForText("Ledger reversal");

    const filteredCall = fetchCalls.find((call) =>
      call.url.includes("operation=ledger_entries.reverse") && call.url.includes("decision=DENIED"),
    );
    expect(filteredCall).toBeDefined();
  });


  it("filters and displays Tenant Support Access Lease attribution", async () => {
    mockAuditFetch(auditLogs);

    renderPage();

    await waitForText("Support Lease: lease-support-a");
    await changeInput("Support Lease ID", "lease-support-a");
    await clickButton("Apply Filters");

    const filteredCall = await waitForFetchCall((call) =>
      call.url.includes("supportLeaseId=lease-support-a"),
    );
    expect(filteredCall).toBeDefined();
  });

  it("shows an empty state", async () => {
    mockAuditFetch([]);

    renderPage();

    await waitForText("No audit logs match the current filters.");
  });
});

function mockAuditFetch(logs: AuthzAuditLog[]) {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);

    if (url.startsWith("/api/v1/authz/audit-logs")) {
      return jsonResponse({ data: logs });
    }

    throw new Error(`Unhandled request: ${url}`);
  });
}

function renderPage() {
  window.localStorage.setItem("ers.i18n.locale", "en-US");
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/admin/audit-logs", element: <AuditLogViewerPage /> }],
    { initialEntries: ["/admin/audit-logs"] },
  );

  act(() => {
    root = createRoot(container);
    root.render(
      <I18nProvider><QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
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

function recordFetchCall(url: string, init?: RequestInit) {
  fetchCalls.push({
    url,
    method: init?.method?.toUpperCase() ?? "GET",
    headers: normalizeHeaders(init?.headers),
  });
}

function normalizeHeaders(headers: HeadersInit | undefined) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (textNode(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Text not found: ${text}`);
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("body *")).find((element) =>
    element.textContent?.includes(text),
  );
}

async function changeSelect(labelText: string, value: string) {
  const label = Array.from(container.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(labelText),
  );
  const select = label?.querySelector("select") as HTMLSelectElement | null;
  if (!select) throw new Error(`Select not found: ${labelText}`);

  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeInput(labelText: string, value: string) {
  const label = Array.from(container.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(labelText),
  );
  const input = label?.querySelector("input") as HTMLInputElement | null;
  if (!input) throw new Error(`Input not found: ${labelText}`);

  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function waitForFetchCall(predicate: (call: FetchCall) => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const call = fetchCalls.find(predicate);
    if (call) return call;

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  throw new Error("Expected fetch call was not observed");
}

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(name),
  ) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Button not found: ${name}`);

  await act(async () => {
    button.click();
  });
}
