import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpensesPage } from "./ExpensesPage";
import type { Collaborator } from "../../types/collaborators";
import type { Expense, ExpenseListResponse } from "../../types/expenses";
import type { PriceListItem } from "../../types/priceList";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

const collaborators: Collaborator[] = [
  collaborator("collab-1", "Maria", "Maria Silva"),
  collaborator("collab-2", "João", "João Santos"),
  collaborator("collab-3", "Mineiro", "Bruno Costa"),
];
const recentlyCreatedCollaborator = collaborator(
  "collab-recent",
  "NovoMineiro",
  "Carlos Recente",
);

const longItemDescription = "DEV Smoke Test Water With A Long Display Name";
const longItemCode = "DEV_SMOKE_WATER_1782258281";
const longItemLabel = `${longItemDescription} · ${longItemCode}`;

const priceListItems: PriceListItem[] = [
  priceListItem("item-1", "CANTEEN", "WATER", "Water"),
  priceListItem("item-2", "ADMINISTRATIVE", "FLIGHT", "Flight"),
  priceListItem("item-long", "CANTEEN", longItemCode, longItemDescription),
];

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

describe("ExpensesPage", () => {
  it("shows a navigation link back to People", async () => {
    mockExpensePageFetch();

    renderExpensesPage("/expenses");

    await waitForText("Showing 50 of 520 expense records.");

    const peopleLink = Array.from(container.querySelectorAll("a")).find(
      (candidate) => candidate.textContent?.trim() === "People",
    );

    expect(peopleLink?.getAttribute("href")).toBe("/people");
  });

  it("navigates expense pages", async () => {
    mockExpensePageFetch();

    renderExpensesPage("/expenses");

    await waitForText("Showing 50 of 520 expense records.");
    await waitForText("Filters");
    await waitForText("Filter expense records by collaborator name, nickname, category, or item.");
    await waitForText("Page 1 of 11");

    await clickButton("Next");

    await waitForText("Page 2 of 11");
    expect(fetchCalls.some((call) => call.url === "/api/v1/expenses?page=2&pageSize=50")).toBe(true);
  });

  it("loads matching collaborator dropdown options from the server", async () => {
    mockExpensePageFetch();

    renderExpensesPage("/expenses?page=2");

    await waitForText("Showing 50 of 520 expense records.");
    await changeInput("Collaborator name or nickname", "ovomin");

    await waitForFetchCall((call) => {
      const url = new URL(call.url, "http://localhost");
      return (
        url.pathname === "/api/v1/collaborators" &&
        url.searchParams.get("search") === "ovomin" &&
        url.searchParams.get("page") === "1" &&
        url.searchParams.get("pageSize") === "200"
      );
    });
    await waitForFetchCall((call) => {
      const url = new URL(call.url, "http://localhost");
      return (
        url.pathname === "/api/v1/expenses" &&
        url.searchParams.get("collaboratorSearch") === "ovomin" &&
        url.searchParams.get("page") === "1" &&
        url.searchParams.get("pageSize") === "50"
      );
    });
    expect(
      controlByLabel<HTMLInputElement>(
        "Collaborator name or nickname",
        "input",
      ).value,
    ).toBe("ovomin");

    await waitForText("NovoMineiro · Carlos Recente");

    expect(container.querySelector("#expense-collaborator-filter")).toBeNull();

    const suggestions = container.querySelector(
      '[role="listbox"][aria-label="Matching collaborators"]',
    );
    expect(suggestions?.textContent).toContain("NovoMineiro · Carlos Recente");
    expect(suggestions?.textContent).not.toContain("Maria · Maria Silva");
  });

  it("filters expense pages by collaborator and item", async () => {
    mockExpensePageFetch();

    renderExpensesPage("/expenses");

    await waitForText("Showing 50 of 520 expense records.");
    await changeInput("Collaborator name or nickname", "João");
    await waitForText("João · João Santos");
    await clickOption("João · João Santos");

    await waitForText("Showing 1 of 1 expense records.");
    await waitForText("Selected: João · João Santos");
    expect(fetchCalls.some((call) => call.url === "/api/v1/expenses?collaboratorId=collab-2&page=1&pageSize=50")).toBe(true);
    expect(container.querySelector("#expense-collaborator-filter")).toBeNull();

    await changeSelect("Item", "item-2");

    await waitForText("Flight · FLIGHT");
    expect(fetchCalls.some((call) => call.url === "/api/v1/expenses?collaboratorId=collab-2&priceListItemId=item-2&page=1&pageSize=50")).toBe(true);
  });

  it("filters expense pages by category without requiring a specific item", async () => {
    mockExpensePageFetch();

    renderExpensesPage("/expenses?page=2");

    await waitForText("Showing 50 of 520 expense records.");
    await changeSelect("Category", "CANTEEN");

    await waitForText("Showing 2 of 2 expense records.");
    await waitForText("Water · WATER");
    expect(fetchCalls.some((call) => call.url === "/api/v1/expenses?itemType=CANTEEN&page=1&pageSize=50")).toBe(true);
  });

  it("keeps long selected item labels inside the filter form", async () => {
    mockExpensePageFetch();

    renderExpensesPage("/expenses?itemType=CANTEEN&priceListItemId=item-long");

    await waitForText(longItemLabel);

    const selectedItemLabel = container.querySelector(
      '[data-testid="selected-expense-item-filter-label"]',
    );

    expect(selectedItemLabel?.textContent?.trim()).toBe(longItemLabel);
    expect(selectedItemLabel?.className).toContain("max-w-full");
    expect(selectedItemLabel?.className).toContain("break-words");
    expect(controlByLabel<HTMLSelectElement>("Item", "select").className).toContain("min-w-0");
  });

  it("shows receipt visibility for each expense", async () => {
    mockExpensePageFetch();

    renderExpensesPage("/expenses?collaboratorId=collab-2");

    await waitForText("Outstanding · Pending issue");
    expect(container.textContent).toContain("Receipt");
    expect(container.querySelector('a[href="/ledger-entries/ledger-expense-filtered-collaborator/receipt"]')).not.toBeNull();
  });
});

function mockExpensePageFetch() {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);

    if (url.startsWith("/api/v1/collaborators/")) {
      const collaboratorId = decodeURIComponent(url.split("/").at(-1) ?? "");
      const selectedCollaborator = [
        ...collaborators,
        recentlyCreatedCollaborator,
      ].find((candidate) => candidate.id === collaboratorId);
      if (!selectedCollaborator) {
        throw new Error(`Unknown collaborator detail request: ${url}`);
      }
      return jsonResponse({ data: selectedCollaborator });
    }

    if (url.startsWith("/api/v1/collaborators")) {
      const params = new URLSearchParams(url.split("?")[1] ?? "");
      const search = params.get("search")?.toLowerCase() ?? "";
      const items =
        search === "ovomin" ? [recentlyCreatedCollaborator] : collaborators;
      return jsonResponse({ data: { items, total: items.length } });
    }

    if (url === "/api/v1/price-list-items?includeInactive=true") {
      return jsonResponse({ data: priceListItems });
    }

    if (url.startsWith("/api/v1/expenses")) {
      return jsonResponse({ data: expenseResponse(url) });
    }

    throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
  });
}

function expenseResponse(url: string): ExpenseListResponse {
  const params = new URLSearchParams(url.split("?")[1] ?? "");
  const page = Number(params.get("page") ?? "1");
  const collaboratorId = params.get("collaboratorId");
  const collaboratorSearch = params.get("collaboratorSearch")?.toLowerCase() ?? "";
  const priceListItemId = params.get("priceListItemId");
  const itemType = params.get("itemType");

  if (collaboratorSearch === "mineiro") {
    return {
      items: [expense("expense-filtered-collaborator-search", "collab-3", "Bruno Mineiro", "item-1", "Water", "WATER")],
      total: 1,
      page,
      pageSize: 50,
    };
  }

  if (itemType === "CANTEEN") {
    return {
      items: [
        expense("expense-filtered-canteen-1", "collab-1", "Maria", "item-1", "Water", "WATER"),
        expense("expense-filtered-canteen-2", "collab-1", "Maria", "item-long", longItemDescription, longItemCode),
      ],
      total: 2,
      page,
      pageSize: 50,
    };
  }

  if (collaboratorId === "collab-2" && priceListItemId === "item-2") {
    return {
      items: [expense("expense-filtered-item", "collab-2", "João", "item-2", "Flight", "FLIGHT")],
      total: 1,
      page,
      pageSize: 50,
    };
  }

  if (collaboratorId === "collab-2") {
    return {
      items: [expense("expense-filtered-collaborator", "collab-2", "João", "item-1", "Water", "WATER")],
      total: 1,
      page,
      pageSize: 50,
    };
  }

  return {
    items: Array.from({ length: 50 }, (_, index) =>
      expense(`expense-${page}-${index + 1}`, "collab-1", "Maria", "item-1", "Water", "WATER"),
    ),
    total: 520,
    page,
    pageSize: 50,
  };
}

function expense(
  id: string,
  collaboratorId: string,
  collaboratorLabel: string,
  priceListItemId: string,
  itemDescription: string,
  itemCode: string,
): Expense {
  return {
    id,
    tenantId: "default",
    personId: `person-${collaboratorId}`,
    collaboratorId,
    collaboratorLabel,
    expenseCategoryId: "category-canteen",
    expenseCategoryLabel: "Canteen",
    valueUnitId: "BRL",
    valueUnitLabel: "BRL",
    amount: 7.5,
    expenseDate: "2026-06-25",
    description: itemDescription,
    active: true,
    priceListItemId,
    priceListItemCode: itemCode,
    itemType: itemDescription === "Flight" ? "ADMINISTRATIVE" : "CANTEEN",
    itemDescription,
    quantity: 1,
    unitPriceBrl: 7.5,
    currencyCode: "BRL",
    unitPriceAmount: 7.5,
    totalAmount: 7.5,
    calculationMethod: "BRL_PRICE_LIST",
    financialPosting: {
      ledgerEntryId: `ledger-${id}`,
      direction: "DEBIT",
      entryType: "EXPENSE_DEDUCTION",
      amount: 7.5,
      signedAmount: -7.5,
      effectiveDate: "2026-06-25",
      valueUnitId: "BRL",
      valueUnitCode: "BRL",
      valueUnitLabel: "Brazilian Real",
      sourceType: "EXPENSE",
      sourceId: id,
      correctionType: "ORIGINAL",
      receiptId: `receipt-${id}`,
      receiptNumber: `REC-${id}`,
      receiptStatus: "PENDING_ISSUE",
      outstandingReceipt: true,
    },
    createdAt: "2026-06-25T12:00:00Z",
    updatedAt: "2026-06-25T12:00:00Z",
  };
}

function collaborator(id: string, name: string, personName = name): Collaborator {
  return {
    id,
    tenantId: "default",
    membershipId: `membership-${id}`,
    personId: `global-person-${id}`,
    legacyPersonId: `person-${id}`,
    personName,
    personNickname: name,
    journeyStartDate: "2026-06-01",
    defaultEndDate: "2026-08-30",
    extensionDays: 0,
    projectedEndDate: "2026-08-30",
    paymentMethodId: "payment-brl",
    paymentMethodLabel: "BRL",
    paymentValue: 100,
    planningAvailability: "ACTIVE",
    sectorId: "sector-mining",
    sectorLabel: "Mining",
    locationId: "location-1",
    locationLabel: "Mine 1",
    taskId: "task-1",
    taskLabel: "General",
    statusId: "status-active",
    statusLabel: "Active",
    createdAt: "2026-06-01T12:00:00Z",
    updatedAt: "2026-06-01T12:00:00Z",
  };
}

function priceListItem(id: string, itemType: string, code: string, description: string): PriceListItem {
  return {
    id,
    tenantId: "default",
    itemType,
    code,
    description,
    unitPriceBrl: 7.5,
    active: true,
    sortOrder: 10,
    createdAt: "2026-06-01T12:00:00Z",
    updatedAt: "2026-06-01T12:00:00Z",
  };
}

function renderExpensesPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/expenses", element: <ExpensesPage /> }],
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

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }));
}

function recordFetchCall(url: string, init?: RequestInit) {
  fetchCalls.push({
    url,
    method: methodOf(init),
    body: init?.body ? parseBody(init.body) : undefined,
  });
}

function methodOf(init?: RequestInit) {
  return init?.method?.toUpperCase() ?? "GET";
}

function parseBody(body: BodyInit) {
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  }));
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

async function waitForFetchUrl(expectedUrl: string) {
  for (let i = 0; i < 60; i += 1) {
    if (fetchCalls.some((call) => call.url === expectedUrl)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Missing fetch URL: ${expectedUrl}`);
}

async function waitForFetchCall(predicate: (call: FetchCall) => boolean) {
  for (let i = 0; i < 60; i += 1) {
    if (fetchCalls.some(predicate)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("Missing matching fetch call");
}

async function clickButton(name: string) {
  await act(async () => {
    const button = Array.from(container.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === name && !candidate.disabled,
    );
    if (!button) throw new Error(`Button not found: ${name}`);
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickOption(name: string) {
  await act(async () => {
    const option = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((candidate) => candidate.textContent?.trim() === name);
    if (!option) throw new Error(`Option not found: ${name}`);
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function changeInput(label: string, value: string) {
  await act(async () => {
    const input = controlByLabel<HTMLInputElement>(label, "input");
    const valueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;

    if (valueSetter) {
      valueSetter.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function changeSelect(label: string, value: string) {
  await act(async () => {
    const select = controlByLabel<HTMLSelectElement>(label, "select");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function controlByLabel<T extends HTMLElement>(label: string, selector: string): T {
  const labelNode = Array.from(container.querySelectorAll("label")).find(
    (candidate) => labelCaption(candidate) === label,
  );
  const associatedControl = labelNode?.htmlFor
    ? container.querySelector(`#${CSS.escape(labelNode.htmlFor)}`)
    : labelNode?.querySelector(selector);
  if (!(associatedControl instanceof HTMLElement) || !associatedControl.matches(selector)) {
    throw new Error(`Control not found for ${label}`);
  }
  return associatedControl as unknown as T;
}

function labelCaption(label: HTMLLabelElement) {
  const textNode = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE);
  return textNode?.textContent?.trim() ?? "";
}

function resetLocalStorage() {
  window.localStorage.clear();
}
