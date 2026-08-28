import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OutstandingReceiptsPage } from "./OutstandingReceiptsPage";
import type { OutstandingReceiptListResult } from "../../types/receipts";

type FetchCall = { url: string; method: string };

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

describe("OutstandingReceiptsPage", () => {
  it("shows filters, source links, current account links, and receipt workflow links", async () => {
    mockReceiptsFetch();

    renderOutstandingReceiptsPage("/receipts/outstanding");

    await waitForText("Outstanding receipts");
    await waitForText("Total outstanding");
    await waitForText("Maria");
    await waitForText("Source: expense");
    await waitForText("Next action: Print receipt");
    expect(container.textContent).toContain("Person owner: person-1");
    expect(container.textContent).toContain("Journey provenance: collab-1");
    expect(container.textContent).toContain("Tenant: default");

    expect(container.querySelector('a[href="/collaborators/collab-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/collaborators/collab-1/current-account"]')).not.toBeNull();
    expect(container.querySelector('a[href="/expenses/expense-1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/ledger-entries/ledger-1/receipt"]')).not.toBeNull();
  });

  it("sends collaborator, source type, and page-size filters to the API", async () => {
    mockReceiptsFetch();

    renderOutstandingReceiptsPage("/receipts/outstanding");

    await waitForText("Outstanding receipts");
    await changeSelect("Source type", "EXPENSE");
    await fillInput("Collaborator", "Maria");
    await clickButton("Apply filters");
    await changeSelect("Page size", "10");

    await vi.waitFor(() => {
      expect(
        fetchCalls.some((call) => {
          const url = new URL(call.url, "http://localhost");
          return (
            url.pathname === "/api/v1/receipts/outstanding" &&
            url.searchParams.get("sourceType") === "EXPENSE" &&
            url.searchParams.get("collaborator") === "Maria" &&
            url.searchParams.get("page") === "1" &&
            url.searchParams.get("pageSize") === "10"
          );
        }),
      ).toBe(true);
    });
  });
});

function mockReceiptsFetch() {
  mockFetch(async (url, init) => {
    fetchCalls.push({ url, method: init?.method ?? "GET" });

    if (url.startsWith("/api/v1/receipts/outstanding")) {
      return jsonResponse({ data: outstandingReceipts });
    }

    throw new Error(`Unhandled request: ${init?.method ?? "GET"} ${url}`);
  });
}

const outstandingReceipts: OutstandingReceiptListResult = {
  items: [
    {
      id: "receipt-1",
      tenantId: "default",
      personId: "person-1",
      receiptNumber: "R-1",
      receiptType: "LEDGER_DEBIT",
      receiptPurpose: "LEDGER_DEBIT",
      paymentDirection: "ACCOUNT_DEBIT",
      acceptingParty: "COLLABORATOR",
      status: "PENDING_ISSUE",
      ledgerEntryId: "ledger-1",
      entryType: "EXPENSE_DEDUCTION",
      effectiveDate: "2026-06-27",
      valueUnitCode: "BRL",
      valueUnitLabel: "Brazilian Real",
      amount: 42.5,
      description: "Canteen meal",
      sourceType: "EXPENSE",
      sourceId: "expense-1",
      collaboratorId: "collab-1",
      collaboratorLabel: "Maria",
      collaboratorLegalName: "Maria Silva",
      collaboratorCpf: "12345678901",
      createdAt: "2026-06-27T00:00:00Z",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 25,
  summary: {
    pendingIssue: 1,
    issued: 0,
    printed: 0,
    signed: 0,
    total: 1,
  },
};

function renderOutstandingReceiptsPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/receipts/outstanding",
        element: <OutstandingReceiptsPage />,
      },
    ],
    { initialEntries: [initialEntry] },
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

async function fillInput(label: string, value: string) {
  const control = controlByLabel<HTMLInputElement>(label, "input");
  const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    valueSetter?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickButton(name: string) {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((candidate) => candidate.textContent?.trim() === name);
  if (!button) throw new Error(`Button not found: ${name}`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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
