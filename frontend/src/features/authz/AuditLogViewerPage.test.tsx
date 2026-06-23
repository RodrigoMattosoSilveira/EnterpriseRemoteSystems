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
    actorId: "bootstrap-admin",
    actorRecordId: "actor-bootstrap-admin",
    tenantId: "default",
    permissionCode: "journey_settlements.partial_payout",
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
  resetAuthzAdminLocalStorage();
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
  it("loads sensitive audit events with request actor headers", async () => {
    mockAuditFetch(auditLogs);

    renderPage();

    await waitForText("Audit Log Viewer");
    await waitForText("Partial payout");
    await waitForText("AUTHORIZED");
    await waitForText("COLLABORATOR_REQUESTED_PAYOUT");
    await waitForText("second-admin@example.com");
    await waitForText("recent reauthentication is required");

    const getCall = fetchCalls.find((call) => call.url.startsWith("/api/v1/authz/audit-logs"));
    expect(getCall?.headers["X-Actor-ID"]).toBe("bootstrap-admin");
    expect(getCall?.headers["X-Tenant-ID"]).toBe("default");
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
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
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

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(name),
  ) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Button not found: ${name}`);

  await act(async () => {
    button.click();
  });
}

function resetAuthzAdminLocalStorage() {
  const storage = window.localStorage as Storage & { clear?: () => void };

  if (typeof storage.removeItem === "function") {
    storage.removeItem("ers.authzAdmin.requestActor");
    return;
  }

  if (typeof storage.setItem === "function") {
    storage.setItem("ers.authzAdmin.requestActor", "");
  }
}
