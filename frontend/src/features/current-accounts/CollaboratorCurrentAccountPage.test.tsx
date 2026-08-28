import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import type { AuthzCurrentActor } from "../../types/authz";
import { CollaboratorCurrentAccountPage } from "./CollaboratorCurrentAccountPage";
import type { CurrentAccountDetail } from "../../types/currentAccounts";

type FetchCall = { url: string; method: string };

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: FetchCall[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchCalls = [];
  resetLocalStorage();
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

describe("CollaboratorCurrentAccountPage", () => {
  it("shows balances, ledger entries, source links, and receipt workflow links", async () => {
    mockCurrentAccountFetch();

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Person Current Account");
    await waitForText("Person-owned balances and ledger history in the selected Tenant.");
    await waitForText("Maria");
    await waitForText("42,50");
    await waitForText("expense deduction");
    await waitForText("Receipt: Pending issue");
    await waitForText("Outstanding receipt: print, collect signature, and record the signed return.");

    expect(container.querySelector('a[href="/expenses/expense-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/ledger-entries/ledger-1/receipt"]')).not.toBeNull();
  });

  it("opens the selected Journey Current + Future Earnings projection", async () => {
    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: methodOf(init) });
      if (url.startsWith("/api/v1/collaborators/collab-1/current-account")) {
        return jsonResponse({ data: currentAccountDetailWith([expenseEntry, earningEntry]) });
      }
      if (url === "/api/v1/collaborators/collab-1/financial-projection") {
        return jsonResponse({
          data: {
            collaboratorId: "collab-1",
            collaboratorLabel: "Maria",
            paymentMethodCode: "DAILY_BRL",
            currentBalances: { brlAmount: 25, goldGramAmount: 0 },
            unpostedReadyEarnings: { brlAmount: 0, goldGramAmount: 0 },
            estimatedFutureEarnings: { brlAmount: 75, goldGramAmount: 0 },
            projectedEarnings: { brlAmount: 75, goldGramAmount: 0 },
            projectedFinalBalances: { brlAmount: 100, goldGramAmount: 0 },
            projection: {
              projectionDate: "2026-08-25",
              journeyEndDate: "2026-08-27",
              periodsPerDay: 1,
              remainingWorkPeriods: 3,
              calendarWorkPeriods: 3,
              postedWorkPeriods: 0,
              readyAccrualWorkPeriods: 0,
              estimatedFutureWorkPeriods: 3,
              pendingAccrualItems: 0,
              productionMethod: "DAILY_BRL",
              productionDatesAvailable: 0,
            },
          },
        });
      }
      throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
    });

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Current + Future Earnings");
    await clickButton("Current + Future Earnings");
    await waitForText("Current and Future Earnings");
    await waitForText("Projected Journey-End Balances");

    expect(container.textContent).toContain("25,00");
    expect(
      fetchCalls.some(
        (call) => call.url === "/api/v1/collaborators/collab-1/financial-projection",
      ),
    ).toBe(true);
  });

  it("shows direction-aware in-app acceptance guidance for final-settlement receipts", async () => {
    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: methodOf(init) });
      if (url.startsWith("/api/v1/collaborators/collab-1/current-account")) {
        return jsonResponse({ data: currentAccountDetailWith([finalSettlementEntry]) });
      }
      throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
    });

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Awaiting Collaborator in-app acceptance.");
    expect(container.textContent).toContain("Payment direction: Tenant To Collaborator");
    expect(container.textContent).toContain("Accepting party: Collaborator");
    expect(container.textContent).toContain("Review / accept receipt");
    expect(container.textContent).not.toContain("print, collect signature");
  });

  it("hides the final-settlement receipt action after in-app acceptance", async () => {
    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: methodOf(init) });
      if (url.startsWith("/api/v1/collaborators/collab-1/current-account")) {
        return jsonResponse({
          data: currentAccountDetailWith([acceptedFinalSettlementEntry]),
        });
      }
      throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
    });

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Final settlement receipt accepted in-app.");
    expect(container.textContent).toContain("Payment direction: Tenant To Collaborator");
    expect(container.textContent).toContain("Accepting party: Collaborator");
    expect(container.textContent).not.toContain("Review / accept receipt");
    expect(
      container.querySelector('a[href="/ledger-entries/ledger-final-accepted/receipt"]'),
    ).toBeNull();
  });

  it("shows Collaborator-to-Tenant settlement authorization metadata", async () => {
    const collaboratorPaymentEntry = {
      ...finalSettlementEntry,
      id: "ledger-final-collaborator-payment",
      receipt: {
        ...finalSettlementEntry.receipt!,
        id: "receipt-final-collaborator-payment",
        receiptPurpose: "FINAL_SETTLEMENT_COLLABORATOR_PAYMENT",
        paymentDirection: "COLLABORATOR_TO_TENANT",
        acceptingParty: "TENANT",
      },
    };

    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: methodOf(init) });
      if (url.startsWith("/api/v1/collaborators/collab-1/current-account")) {
        return jsonResponse({ data: currentAccountDetailWith([collaboratorPaymentEntry]) });
      }
      throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
    });

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Payment direction: Collaborator To Tenant");
    expect(container.textContent).toContain("Accepting party: Tenant");
  });

  it("shows canonical Person ownership and historical Journey provenance on each ledger row", async () => {
    const historicalEntry = {
      ...earningEntry,
      id: "ledger-historical-a1",
      personId: "person-a",
      collaboratorId: "journey-a1-closed",
      description: "Historical A1 earning",
    };

    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: methodOf(init) });
      if (url.startsWith("/api/v1/collaborators/collab-1/current-account")) {
        return jsonResponse({ data: currentAccountDetailWith([historicalEntry]) });
      }
      throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
    });

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Historical A1 earning");
    expect(container.textContent).toContain("Person owner: person-a");
    expect(container.textContent).toContain("Journey provenance: journey-a1-closed");
    expect(
      container.querySelector('a[href="/collaborators/journey-a1-closed"]'),
    ).not.toBeNull();
  });

  it("filters to work-period assignment earnings", async () => {
    mockCurrentAccountFetch();

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Ledger Entries");
    await changeSelect("Filter ledger entries", "earnings");

    expect(
      fetchCalls.some(
        (call) =>
          call.url ===
          "/api/v1/collaborators/collab-1/current-account?sourceType=WORK_PERIOD_ASSIGNMENT&page=1&pageSize=25",
      ),
    ).toBe(true);
  });

  it("shows earning source details and links back to the Work Period", async () => {
    mockCurrentAccountFetch();

    renderCurrentAccountPage("/collaborators/collab-1/current-account?filter=earnings");

    await waitForText("earning credit");
    await waitForText("Work Period 2026-06-05 · 06:00-18:00 · Assignment assign-1");

    expect(container.querySelector('a[href="/work-periods/wp-1"]')).not.toBeNull();
    expect(container.textContent).toContain("Open Work Period");
  });

  it("filters to outstanding receipt ledger entries", async () => {
    mockCurrentAccountFetch();

    renderCurrentAccountPage("/collaborators/collab-1/current-account");

    await waitForText("Ledger Entries");
    await changeSelect("Filter ledger entries", "outstanding-receipts");

    await waitForText("Showing page 1 of 1 · 1 ledger entry");
    expect(
      fetchCalls.some(
        (call) =>
          call.url ===
          "/api/v1/collaborators/collab-1/current-account?outstandingReceipts=true&page=1&pageSize=25",
      ),
    ).toBe(true);
  });
});

function mockCurrentAccountFetch() {
  mockFetch(async (url, init) => {
    fetchCalls.push({ url, method: methodOf(init) });

    if (url.startsWith("/api/v1/collaborators/collab-1/current-account")) {
      if (url.includes("sourceType=WORK_PERIOD_ASSIGNMENT")) {
        return jsonResponse({ data: currentAccountDetailWith([earningEntry]) });
      }
      if (url.includes("outstandingReceipts=true")) {
        return jsonResponse({ data: currentAccountDetailWith([expenseEntry]) });
      }
      return jsonResponse({ data: currentAccountDetailWith([expenseEntry, earningEntry]) });
    }

    throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
  });
}

function currentAccountDetailWith(
  items: CurrentAccountDetail["ledgerEntries"]["items"],
): CurrentAccountDetail {
  return {
    personId: "person-1",
    personLabel: "Maria",
    collaboratorId: "collab-1",
    collaboratorLabel: "Maria",
    balances: [
      {
        personId: "person-1",
        personLabel: "Maria",
        collaboratorId: "collab-1",
        collaboratorLabel: "Maria",
        valueUnitId: "ref-value-unit-brl",
        valueUnitCode: "BRL",
        valueUnitLabel: "Brazilian Real",
        balance: -42.5,
      },
    ],
    ledgerEntries: {
      items,
      total: items.length,
      page: 1,
      pageSize: 25,
    },
  };
}

const authorizationActor: AuthzCurrentActor = {
  actorKey: "test-admin",
  actorRecordId: "actor-test-admin",
  tenantId: "default",
  scope: "APPLICATION",
  roleCodes: ["APPLICATION_ADMIN"],
  permissions: ["*"],
};

const expenseEntry: CurrentAccountDetail["ledgerEntries"]["items"][number] = {
  id: "ledger-1",
  tenantId: "default",
  personId: "person-1",
  collaboratorId: "collab-1",
  valueUnitId: "ref-value-unit-brl",
  valueUnitCode: "BRL",
  valueUnitLabel: "Brazilian Real",
  entryType: "EXPENSE_DEDUCTION",
  direction: "DEBIT",
  amount: 42.5,
  signedAmount: -42.5,
  effectiveDate: "2026-06-27",
  sourceType: "EXPENSE",
  sourceId: "expense-1",
  active: true,
  correctionType: "ORIGINAL",
  createdAt: "2026-06-27T00:00:00Z",
  updatedAt: "2026-06-27T00:00:00Z",
  receipt: {
    id: "receipt-1",
    receiptNumber: "R-1",
    status: "PENDING_ISSUE",
    outstanding: true,
  },
};

const finalSettlementEntry: CurrentAccountDetail["ledgerEntries"]["items"][number] = {
  id: "ledger-final-1",
  tenantId: "default",
  personId: "person-1",
  collaboratorId: "collab-1",
  valueUnitId: "ref-value-unit-brl",
  valueUnitCode: "BRL",
  valueUnitLabel: "Brazilian Real",
  entryType: "FINAL_SETTLEMENT",
  direction: "DEBIT",
  amount: 125,
  signedAmount: -125,
  effectiveDate: "2026-06-30",
  sourceType: "JOURNEY_SETTLEMENT",
  sourceId: "settlement-final-1",
  active: true,
  correctionType: "ORIGINAL",
  createdAt: "2026-06-30T00:00:00Z",
  updatedAt: "2026-06-30T00:00:00Z",
  receipt: {
    id: "receipt-final-1",
    receiptNumber: "FS-1",
    receiptPurpose: "FINAL_SETTLEMENT_TENANT_PAYMENT",
    paymentDirection: "TENANT_TO_COLLABORATOR",
    acceptingParty: "COLLABORATOR",
    status: "PENDING_ISSUE",
    outstanding: true,
  },
};

const acceptedFinalSettlementEntry: CurrentAccountDetail["ledgerEntries"]["items"][number] = {
  ...finalSettlementEntry,
  id: "ledger-final-accepted",
  receipt: {
    ...finalSettlementEntry.receipt!,
    status: "RETURNED",
    outstanding: false,
    acceptedAt: "2026-06-30T12:00:00Z",
  },
};

const earningEntry: CurrentAccountDetail["ledgerEntries"]["items"][number] = {
  id: "ledger-earning-1",
  tenantId: "default",
  personId: "person-1",
  collaboratorId: "collab-1",
  valueUnitId: "ref-value-unit-brl",
  valueUnitCode: "BRL",
  valueUnitLabel: "Brazilian Real",
  entryType: "EARNING_CREDIT",
  direction: "CREDIT",
  amount: 150,
  signedAmount: 150,
  effectiveDate: "2026-06-05",
  sourceType: "WORK_PERIOD_ASSIGNMENT",
  sourceId: "assign-1",
  sourceLabel: "Work Period 2026-06-05 · 06:00-18:00",
  sourceWorkPeriodId: "wp-1",
  sourceWorkDate: "2026-06-05",
  sourceWorkPeriodName: "06:00-18:00",
  description: "Daily BRL earning for Maria",
  active: true,
  correctionType: "ORIGINAL",
  createdAt: "2026-06-05T00:00:00Z",
  updatedAt: "2026-06-05T00:00:00Z",
};

function renderCurrentAccountPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/collaborators/:id/current-account",
        element: <CollaboratorCurrentAccountPage />,
      },
    ],
    { initialEntries: [initialEntry] },
  );

  act(() => {
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={queryClient}>
        <AuthorizationProvider value={authorizationActor}>
          <RouterProvider router={router} />
        </AuthorizationProvider>
      </QueryClientProvider>,
    );
  });
}

async function waitForText(text: string) {
  await vi.waitFor(() => {
    expect(container.textContent).toContain(text);
  });
}

async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function changeSelect(label: string, value: string) {
  const control = controlByLabel<HTMLSelectElement>(label, "select");
  await act(async () => {
    control.value = value;
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function controlByLabel<T extends HTMLElement>(label: string, selector: string): T {
  const labels = Array.from(container.querySelectorAll("label"));
  const match = labels.find((candidate) =>
    candidate.textContent?.toLowerCase().includes(label.toLowerCase()),
  );
  const control = match?.querySelector(selector);
  if (!control) throw new Error(`Control not found: ${label}`);
  return control as T;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      return handler(url, init);
    }),
  );
}

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function methodOf(init?: RequestInit) {
  return init?.method ?? "GET";
}

function resetLocalStorage() {
  window.localStorage.clear();
}
