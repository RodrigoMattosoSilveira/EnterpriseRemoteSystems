import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../app/i18n";
import { CollaboratorCurrentAccountPage } from "./CollaboratorCurrentAccountPage";
import type { CurrentAccountDetail } from "../../types/currentAccounts";

type FetchCall = { url: string; method: string };

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: FetchCall[];

beforeEach(() => {
  void i18n.changeLanguage("en");
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

    await waitForText("Maria");
    await waitForText("42,50");
    await waitForText("expense deduction");
    await waitForText("Receipt: Pending issue");
    await waitForText("Outstanding receipt: print, collect signature, and record the signed return.");

    expect(container.querySelector('a[href="/expenses/expense-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/ledger-entries/ledger-1/receipt"]')).not.toBeNull();
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
    collaboratorId: "collab-1",
    collaboratorLabel: "Maria",
    balances: [
      {
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

const expenseEntry: CurrentAccountDetail["ledgerEntries"]["items"][number] = {
  id: "ledger-1",
  tenantId: "default",
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

const earningEntry: CurrentAccountDetail["ledgerEntries"]["items"][number] = {
  id: "ledger-earning-1",
  tenantId: "default",
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
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>,
    );
  });
}

async function waitForText(text: string) {
  await vi.waitFor(() => {
    expect(container.textContent).toContain(text);
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
