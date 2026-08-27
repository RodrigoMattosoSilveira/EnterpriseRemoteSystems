import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import type { AuthzCurrentActor } from "../../types/authz";
import type { Expense } from "../../types/expenses";
import { ExpenseDetailPage } from "./ExpenseDetailPage";

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: Array<{ url: string; method: string; body?: unknown }>;

const expense: Expense = {
  id: "expense-1",
  tenantId: "tenant-a",
  personId: "person-a",
  collaboratorId: "journey-a",
  collaboratorLabel: "Identity A",
  expenseCategoryId: "category-canteen",
  expenseCategoryLabel: "Canteen",
  valueUnitId: "value-unit-brl",
  valueUnitLabel: "BRL",
  amount: 20,
  expenseDate: "2026-08-26",
  description: "Incorrect expense",
  active: true,
  priceListItemId: "price-item-20",
  priceListItemCode: "MANUAL30G_EXPENSE_20",
  itemType: "CANTEEN",
  itemDescription: "30G manual expense",
  quantity: 1,
  unitPriceBrl: 20,
  currencyCode: "BRL",
  unitPriceAmount: 20,
  totalAmount: 20,
  calculationMethod: "BRL_PRICE_LIST",
  financialPosting: {
    ledgerEntryId: "ledger-expense-1",
    direction: "DEBIT",
    entryType: "EXPENSE_DEDUCTION",
    amount: 20,
    signedAmount: -20,
    effectiveDate: "2026-08-26",
    valueUnitId: "value-unit-brl",
    valueUnitCode: "BRL",
    valueUnitLabel: "BRL",
    sourceType: "EXPENSE",
    sourceId: "expense-1",
    correctionType: "ORIGINAL",
    receiptId: "receipt-1",
    receiptNumber: "RCP-1",
    receiptStatus: "PENDING_ISSUE",
    outstandingReceipt: true,
  },
  createdAt: "2026-08-26T12:00:00Z",
  updatedAt: "2026-08-26T12:00:00Z",
};

const tenantAdmin: AuthzCurrentActor = {
  actorKey: "tenant-admin",
  actorRecordId: "tenant-admin-record",
  tenantId: "tenant-a",
  scope: "TENANT",
  roleCodes: ["TENANT_ADMIN"],
  permissions: ["expenses.read", "expenses.create", "expenses.update"],
};

const expenseOperator: AuthzCurrentActor = {
  actorKey: "expense-operator",
  actorRecordId: "expense-operator-record",
  tenantId: "tenant-a",
  scope: "TENANT",
  roleCodes: ["EXPENSE_OPERATOR"],
  permissions: ["expenses.read", "expenses.create"],
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchCalls = [];
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

describe("ExpenseDetailPage correction workflow", () => {
  it("lets a Tenant Administrator cancel and recreate an Expense", async () => {
    mockExpenseFetch();
    renderExpenseDetail(tenantAdmin);

    await waitForText("Correct Expense");
    await clickButton("Correct expense");
    await changeTextarea("Cancellation reason", "Wrong Collaborator Journey");
    await clickButton("Cancel and recreate");

    await waitForText("Replacement form");
    const cancelCall = fetchCalls.find(
      (call) =>
        call.method === "POST" &&
        call.url === "/api/v1/expenses/expense-1/cancel",
    );
    expect(cancelCall?.body).toEqual({ reason: "Wrong Collaborator Journey" });
  });

  it("does not expose correction to an Expense Operator", async () => {
    mockExpenseFetch();
    renderExpenseDetail(expenseOperator);

    await waitForText("Incorrect expense");
    expect(container.textContent).not.toContain("Correct Expense");
    expect(container.textContent).not.toContain("Correct expense");
  });
});

function renderExpenseDetail(actor: AuthzCurrentActor) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/expenses/:id", element: <ExpenseDetailPage /> },
      { path: "/expenses/new", element: <div>Replacement form</div> },
      { path: "/expenses", element: <div>Expenses</div> },
    ],
    { initialEntries: ["/expenses/expense-1"] },
  );

  act(() => {
    root = createRoot(container);
    root.render(
      <AuthorizationProvider value={actor}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AuthorizationProvider>,
    );
  });
}

function mockExpenseFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const method = init?.method?.toUpperCase() ?? "GET";
      fetchCalls.push({
        url,
        method,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      });

      if (url === "/api/v1/expenses/expense-1" && method === "GET") {
        return Promise.resolve(jsonResponse({ data: expense }));
      }
      if (url === "/api/v1/expenses/expense-1/cancel" && method === "POST") {
        return Promise.resolve(
          jsonResponse({
            data: {
              ...expense,
              active: false,
              cancelledAt: "2026-08-26T12:30:00Z",
              cancelledBy: "tenant-admin",
              cancellationReason: "Wrong Collaborator Journey",
              financialPosting: {
                ...expense.financialPosting,
                receiptStatus: "CANCELLED",
                outstandingReceipt: false,
              },
            },
          }),
        );
      }
      throw new Error(`Unhandled request: ${method} ${url}`);
    }),
  );
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitForText(text: string) {
  for (let i = 0; i < 60; i += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Missing text: ${text}`);
}

async function clickButton(name: string) {
  await act(async () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) =>
        candidate.textContent?.trim() === name && !candidate.disabled,
    );
    if (!button) throw new Error(`Button not found: ${name}`);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function changeTextarea(label: string, value: string) {
  const textarea = Array.from(container.querySelectorAll("textarea")).find(
    (candidate) => candidate.getAttribute("aria-label") === label,
  );
  if (!textarea) throw new Error(`Textarea not found: ${label}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
