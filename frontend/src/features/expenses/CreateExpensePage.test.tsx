import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Collaborator } from "../../types/collaborators";
import type { PriceListItem } from "../../types/priceList";
import { CreateExpensePage } from "./CreateExpensePage";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

const activeCollaborator: Collaborator = {
  id: "collab-1",
  tenantId: "default",
  membershipId: "membership-1",
  personId: "global-person-1",
  legacyPersonId: "person-1",
  personNickname: "Maria",
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
  statusId: "tenant-scoped-collaborator-status-active",
  statusCode: "ACTIVE",
  statusLabel: "Active",
  createdAt: "2026-06-01T12:00:00Z",
  updatedAt: "2026-06-01T12:00:00Z",
};

const closedCollaborator: Collaborator = {
  ...activeCollaborator,
  id: "collab-closed",
  membershipId: "membership-closed",
  personId: "global-person-closed",
  legacyPersonId: "person-closed",
  personNickname: "Closed",
  closedAt: "2026-06-30T12:00:00Z",
};

const canteenItem = priceListItem(
  "item-canteen",
  "CANTEEN",
  "SNACK",
  "Snack",
  12.25,
);
const canteenDrinkItem = priceListItem(
  "item-canteen-drink",
  "CANTEEN",
  "DRINK",
  "Drink",
  6.5,
);
const administrativeItem = priceListItem(
  "item-admin",
  "ADMINISTRATIVE",
  "SUPPLY",
  "Admin supply",
  137.28,
);

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

describe("CreateExpensePage", () => {
  it("submits a price-list expense in BRL", async () => {
    mockCreateExpenseFetch();
    renderCreateExpensePage();

    await waitForText("New Expense");
    await selectCollaborator("Maria", "Maria");
    await changeSelect("Category *", "CANTEEN");
    await changeSelect("Item Description *", canteenItem.id);
    await changeSelect("Currency *", "BRL");
    await changeInput("Quantity *", "3");

    await waitForText("36,75");
    await clickButton("Create Expense");

    const createCall = fetchCalls.find(
      (call) =>
        call.method === "POST" &&
        call.url === "/api/v1/expenses/canteen-batch",
    );
    expect(createCall?.body).toMatchObject({
      collaboratorId: activeCollaborator.id,
      items: [
        {
          priceListItemId: canteenItem.id,
          currencyCode: "BRL",
          quantity: 3,
        },
      ],
    });
    expect(createCall?.body).not.toHaveProperty("expenseCategoryId");
    expect(createCall?.body).not.toHaveProperty("valueUnitId");
    expect(createCall?.body).not.toHaveProperty("amount");
    await waitForText("Expenses landing");
  });

  it("records multiple Canteen items atomically with a currency per line", async () => {
    mockCreateExpenseFetch();
    renderCreateExpensePage();

    await waitForText("New Expense");
    await selectCollaborator("Maria", "Maria");
    await changeSelect("Item Description *", canteenItem.id);
    await changeInput("Quantity *", "2");
    await clickButton("Add Canteen Item");

    await changeSelectByAriaLabel(
      "Canteen item 2 description",
      canteenDrinkItem.id,
    );
    await changeSelectByAriaLabel("Canteen item 2 currency", "GOLD_GRAM");
    await changeInputByAriaLabel("Canteen item 2 quantity", "3");

    await clickButton("Create Expenses");

    const createCall = fetchCalls.find(
      (call) =>
        call.method === "POST" &&
        call.url === "/api/v1/expenses/canteen-batch",
    );
    expect(createCall?.body).toMatchObject({
      collaboratorId: activeCollaborator.id,
      items: [
        {
          priceListItemId: canteenItem.id,
          currencyCode: "BRL",
          quantity: 2,
        },
        {
          priceListItemId: canteenDrinkItem.id,
          currencyCode: "GOLD_GRAM",
          quantity: 3,
        },
      ],
    });
    expect(
      fetchCalls.some(
        (call) => call.method === "POST" && call.url === "/api/v1/expenses",
      ),
    ).toBe(false);
    await waitForText("Expenses landing");
  });

  it("previews grams-of-gold conversion from the latest gold price", async () => {
    mockCreateExpenseFetch();
    renderCreateExpensePage();

    await waitForText("New Expense");
    await selectCollaborator("Maria", "Maria");
    await changeSelect("Category *", "ADMINISTRATIVE");
    await changeSelect("Item Description *", administrativeItem.id);
    await changeSelect("Currency *", "GOLD_GRAM");
    await changeInput("Quantity *", "2");

    await waitForText("Latest gold price source");
    await waitForText("1 g gold");
    await waitForText("2 g gold");

    await clickButton("Create Expense");

    const createCall = fetchCalls.find(
      (call) => call.method === "POST" && call.url === "/api/v1/expenses",
    );
    expect(createCall?.body).toMatchObject({
      collaboratorId: activeCollaborator.id,
      priceListItemId: administrativeItem.id,
      currencyCode: "GOLD_GRAM",
      quantity: 2,
    });
    await waitForText("Expenses landing");
  });

  it("loads a newly created active Collaborator with targeted server search", async () => {
    mockCreateExpenseFetch([closedCollaborator, activeCollaborator]);
    renderCreateExpensePage();

    await changeInput("Collaborator *", "ari");
    await waitForText("Maria");
    await clickOption("Maria");
    await waitForText("Selected: Maria");

    const searchCall = fetchCalls.find((call) => {
      const url = new URL(call.url, "http://localhost");
      return (
        url.pathname === "/api/v1/collaborators" &&
        url.searchParams.get("search") === "ari" &&
        url.searchParams.get("page") === "1" &&
        url.searchParams.get("pageSize") === "25"
      );
    });
    expect(searchCall).toBeDefined();
    expect(
      fetchCalls.some((call) =>
        call.url.includes("/api/v1/collaborators?page=2"),
      ),
    ).toBe(false);
  });

  it("prefills a replacement from a cancelled Expense and preserves the audit link", async () => {
    mockRecreateExpenseFetch();
    renderCreateExpensePage("/expenses/new?copyFrom=expense-cancelled");

    await waitForText("Recreate Expense");
    await waitForText("Replacement for cancelled Expense");
    await waitForText("Selected: Maria");

    const quantityInput = await waitForControlByLabel<HTMLInputElement>(
      "Quantity *",
      "input",
    );
    expect(quantityInput.value).toBe("3");

    await changeInput("Quantity *", "2");
    await clickButton("Create Replacement Expense");

    const createCall = fetchCalls.find(
      (call) => call.method === "POST" && call.url === "/api/v1/expenses",
    );
    expect(createCall?.body).toMatchObject({
      collaboratorId: activeCollaborator.id,
      priceListItemId: canteenItem.id,
      currencyCode: "BRL",
      quantity: 2,
      recreatedFromExpenseId: "expense-cancelled",
    });
    await waitForText("Replacement detail");
  });

  it("requires a price-list item before submitting", async () => {
    mockCreateExpenseFetch();
    renderCreateExpensePage();

    await waitForText("New Expense");
    await selectCollaborator("Maria", "Maria");
    await clickButton("Create Expense");

    await waitForText("Select an item description from the price list.");
    expect(
      fetchCalls.some(
        (call) => call.method === "POST" && call.url === "/api/v1/expenses",
      ),
    ).toBe(false);
  });
});

function mockCreateExpenseFetch(
  collaborators: Collaborator[] = [activeCollaborator],
) {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);

    if (url.startsWith("/api/v1/collaborators?")) {
      const search = normalizeSearch(
        new URL(url, "http://localhost").searchParams.get("search") ?? "",
      );
      const items = collaborators.filter((collaborator) =>
        normalizeSearch(
          `${collaborator.personNickname ?? ""} ${collaborator.personName ?? ""}`,
        ).includes(search),
      );
      return jsonResponse({
        data: {
          items,
          total: items.length,
        },
      });
    }
    if (url === "/api/v1/price-list-items") {
      return jsonResponse({
        data: [canteenItem, canteenDrinkItem, administrativeItem],
      });
    }
    if (url === "/api/v1/gold-prices/latest") {
      return jsonResponse({
        data: {
          id: "gold-price-1",
          tenantId: "default",
          priceDate: "2099-06-25",
          brlPerGram: 137.28,
          recordedBy: "bootstrap-admin",
          notes: "Latest price for create expense test",
          active: true,
          createdAt: "2099-06-25T12:00:00Z",
          updatedAt: "2099-06-25T12:00:00Z",
        },
      });
    }
    if (
      url === "/api/v1/expenses/canteen-batch" &&
      methodOf(init) === "POST"
    ) {
      const body = parseBody(init?.body) as {
        collaboratorId: string;
        expenseDate: string;
        description?: string;
        items: Array<{
          priceListItemId: string;
          currencyCode: string;
          quantity: number;
        }>;
      };
      return jsonResponse({
        data: {
          items: body.items.map((item, index) => ({
            id: `expense-batch-${index + 1}`,
            tenantId: "default",
            collaboratorId: body.collaboratorId,
            collaboratorLabel: activeCollaborator.personNickname,
            expenseDate: body.expenseDate,
            description: body.description,
            priceListItemId: item.priceListItemId,
            currencyCode: item.currencyCode,
            quantity: item.quantity,
            active: true,
            createdAt: "2026-06-25T12:00:00Z",
            updatedAt: "2026-06-25T12:00:00Z",
          })),
        },
      });
    }
    if (url === "/api/v1/expenses" && methodOf(init) === "POST") {
      const body = parseBody(init?.body);
      return jsonResponse({
        data: {
          id: "expense-1",
          tenantId: "default",
          collaboratorId: activeCollaborator.id,
          collaboratorLabel: activeCollaborator.personNickname,
          expenseCategoryId: "ref-expense-category-canteen",
          expenseCategoryLabel: "Canteen",
          valueUnitId: "ref-value-unit-brl",
          valueUnitLabel: "BRL",
          amount: 36.75,
          expenseDate: "2026-06-25",
          active: true,
          ...body,
          createdAt: "2026-06-25T12:00:00Z",
          updatedAt: "2026-06-25T12:00:00Z",
        },
      });
    }

    throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
  });
}

function mockRecreateExpenseFetch() {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);

    if (url === "/api/v1/expenses/expense-cancelled") {
      return jsonResponse({
        data: {
          id: "expense-cancelled",
          tenantId: "default",
          personId: activeCollaborator.personId,
          collaboratorId: activeCollaborator.id,
          collaboratorLabel: activeCollaborator.personNickname,
          expenseCategoryId: "ref-expense-category-canteen",
          expenseCategoryLabel: "Canteen",
          valueUnitId: "ref-value-unit-brl",
          valueUnitLabel: "BRL",
          amount: 36.75,
          expenseDate: "2026-06-25",
          description: "Wrong quantity",
          active: false,
          cancelledAt: "2026-06-26T12:00:00Z",
          cancelledBy: "tenant-admin",
          cancellationReason: "Wrong quantity",
          priceListItemId: canteenItem.id,
          priceListItemCode: canteenItem.code,
          itemType: "CANTEEN",
          itemDescription: canteenItem.description,
          quantity: 3,
          unitPriceBrl: canteenItem.unitPriceBrl,
          currencyCode: "BRL",
          unitPriceAmount: canteenItem.unitPriceBrl,
          totalAmount: 36.75,
          calculationMethod: "BRL_PRICE_LIST",
          createdAt: "2026-06-25T12:00:00Z",
          updatedAt: "2026-06-26T12:00:00Z",
        },
      });
    }
    if (url === `/api/v1/collaborators/${activeCollaborator.id}`) {
      return jsonResponse({ data: activeCollaborator });
    }
    if (url === "/api/v1/price-list-items") {
      return jsonResponse({ data: [canteenItem, administrativeItem] });
    }
    if (url === "/api/v1/gold-prices/latest") {
      return jsonResponse({
        data: {
          id: "gold-price-1",
          tenantId: "default",
          priceDate: "2099-06-25",
          brlPerGram: 137.28,
          recordedBy: "bootstrap-admin",
          notes: "Latest price for create expense test",
          active: true,
          createdAt: "2099-06-25T12:00:00Z",
          updatedAt: "2099-06-25T12:00:00Z",
        },
      });
    }
    if (url === "/api/v1/expenses" && methodOf(init) === "POST") {
      const body = parseBody(init?.body);
      return jsonResponse({
        data: {
          id: "expense-replacement",
          tenantId: "default",
          personId: activeCollaborator.personId,
          collaboratorId: activeCollaborator.id,
          collaboratorLabel: activeCollaborator.personNickname,
          expenseCategoryId: "ref-expense-category-canteen",
          expenseCategoryLabel: "Canteen",
          valueUnitId: "ref-value-unit-brl",
          valueUnitLabel: "BRL",
          amount: 24.5,
          expenseDate: "2026-06-25",
          active: true,
          priceListItemId: canteenItem.id,
          itemType: "CANTEEN",
          quantity: 2,
          currencyCode: "BRL",
          ...body,
          createdAt: "2026-06-26T12:05:00Z",
          updatedAt: "2026-06-26T12:05:00Z",
        },
      });
    }

    throw new Error(`Unhandled request: ${methodOf(init)} ${url}`);
  });
}

function renderCreateExpensePage(initialEntry = "/expenses/new") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: "/expenses/new", element: <CreateExpensePage /> },
      { path: "/expenses/:id", element: <div>Replacement detail</div> },
      { path: "/expenses", element: <div>Expenses landing</div> },
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

function priceListItem(
  id: string,
  itemType: string,
  code: string,
  description: string,
  unitPriceBrl: number,
): PriceListItem {
  return {
    id,
    tenantId: "default",
    itemType,
    code,
    description,
    unitPriceBrl,
    active: true,
    sortOrder: 10,
    createdAt: "2026-06-01T12:00:00Z",
    updatedAt: "2026-06-01T12:00:00Z",
  };
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
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

function parseBody(body?: BodyInit | null) {
  if (!body || typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function jsonResponse(data: unknown, init: ResponseInit = {}) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: init.status ?? 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
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

async function changeSelect(label: string, value: string) {
  const select = await waitForControlByLabel<HTMLSelectElement>(label, "select");
  await act(async () => {
    setControlValue(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeInput(label: string, value: string) {
  const input = await waitForControlByLabel<HTMLInputElement>(label, "input");
  await act(async () => {
    setControlValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeSelectByAriaLabel(label: string, value: string) {
  const select = await waitForAriaLabel<HTMLSelectElement>(label, "select");
  await act(async () => {
    setControlValue(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeInputByAriaLabel(label: string, value: string) {
  const input = await waitForAriaLabel<HTMLInputElement>(label, "input");
  await act(async () => {
    setControlValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function waitForAriaLabel<T extends HTMLElement>(
  label: string,
  selector: string,
): Promise<T> {
  for (let i = 0; i < 60; i += 1) {
    const control = container.querySelector(`${selector}[aria-label="${label}"]`);
    if (control instanceof HTMLElement) return control as T;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Control not found for aria-label ${label}`);
}

async function selectCollaborator(search: string, optionName: string) {
  await changeInput("Collaborator *", search);
  await waitForText(optionName);
  await clickOption(optionName);
}

async function clickOption(name: string) {
  await act(async () => {
    const option = Array.from(
      container.querySelectorAll<HTMLElement>('[role="option"]'),
    ).find((candidate) => candidate.textContent?.trim() === name);
    if (!option) throw new Error(`Option not found: ${name}`);
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function setControlValue(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(control) as HTMLElement;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

  if (valueSetter) {
    valueSetter.call(control, value);
    return;
  }

  control.value = value;
}

async function waitForControlByLabel<T extends HTMLElement>(
  label: string,
  selector: string,
): Promise<T> {
  for (let i = 0; i < 60; i += 1) {
    const control = controlByLabel<T>(label, selector);
    if (control) return control;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Control not found for ${label}`);
}

function controlByLabel<T extends HTMLElement>(
  label: string,
  selector: string,
): T | null {
  const labelNode = Array.from(container.querySelectorAll("label")).find(
    (candidate) => labelCaption(candidate) === label,
  );
  const control = labelNode?.querySelector(selector);
  if (!(control instanceof HTMLElement)) {
    return null;
  }
  return control as unknown as T;
}

function labelCaption(label: HTMLLabelElement) {
  const textNode = Array.from(label.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE,
  );
  return textNode?.textContent?.trim() ?? "";
}
