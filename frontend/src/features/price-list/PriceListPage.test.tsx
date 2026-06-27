import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PriceListItem } from "../../types/priceList";
import { PriceListPage } from "./PriceListPage";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

const baseRows: PriceListItem[] = [
  {
    id: "price-canteen-snack",
    tenantId: "default",
    itemType: "CANTEEN",
    code: "CANTEEN_SNACK",
    description: "Snack",
    unitPriceBrl: 12.5,
    active: true,
    sortOrder: 20,
    createdAt: "2026-06-21T12:00:00Z",
    updatedAt: "2026-06-21T12:00:00Z",
  },
  {
    id: "price-admin-copy",
    tenantId: "default",
    itemType: "ADMINISTRATIVE",
    code: "ADMINISTRATIVE_DOCUMENT_COPY",
    description: "Document copy",
    unitPriceBrl: 5,
    active: true,
    sortOrder: 10,
    createdAt: "2026-06-21T12:00:00Z",
    updatedAt: "2026-06-21T12:00:00Z",
  },
  {
    id: "price-canteen-old",
    tenantId: "default",
    itemType: "CANTEEN",
    code: "CANTEEN_OLD",
    description: "Old canteen item",
    unitPriceBrl: 3,
    active: false,
    sortOrder: 30,
    createdAt: "2026-06-20T12:00:00Z",
    updatedAt: "2026-06-20T12:00:00Z",
  },
];

let rows: PriceListItem[];
let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: FetchCall[];

beforeEach(() => {
  rows = [...baseRows];
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

describe("PriceListPage", () => {
  it("lists active price-list items and can include inactive history", async () => {
    mockPriceListFetch();

    renderPage();

    await waitForText("Price List Items");
    await waitForText("Snack");
    await waitForText("Document copy");
    expect(textNode("Old canteen item")).toBeUndefined();

    await clickCheckbox("Include inactive");
    await waitForText("Old canteen item");
    await waitForText("Inactive");

    expect(fetchCalls.some((call) => call.url === "/api/v1/price-list-items?includeInactive=true")).toBe(true);
  });

  it("opens the create panel, creates a Canteen item, and dismisses the panel", async () => {
    mockPriceListFetch();

    renderPage();

    await waitForText("Snack");
    expect(textNode("Create Price List Item")).toBeUndefined();

    await clickButton("Add Price List Item");
    await waitForText("Create Price List Item");
    await changeSelectInForm("Create Price List Item", "Category", "CANTEEN");
    await changeInputInForm("Create Price List Item", "Code", "canteen_water_bottle");
    await changeInputInForm("Create Price List Item", "Description", "Water bottle");
    await changeInputInForm("Create Price List Item", "BRL Unit Price", "8.75");
    await changeInputInForm("Create Price List Item", "Sort Order", "5");
    await submitFormByHeading("Create Price List Item");

    await waitForText("Created price-list item: Water bottle.");
    await waitForText("Water bottle");
    expect(textNode("Create Price List Item")).toBeUndefined();

    const createCall = fetchCalls.find((call) => call.method === "POST");
    expect(createCall?.url).toBe("/api/v1/price-list-items");
    expect(createCall?.body).toMatchObject({
      itemType: "CANTEEN",
      code: "canteen_water_bottle",
      description: "Water bottle",
      unitPriceBrl: 8.75,
      sortOrder: 5,
    });
  });

  it("edits an item in place", async () => {
    mockPriceListFetch();

    renderPage();

    await waitForText("Snack");
    await clickButton("Edit");
    await waitForText("Edit Document copy");
    await changeInputInForm("Edit Document copy", "Description", "Document copy updated");
    await changeInputInForm("Edit Document copy", "BRL Unit Price", "6.25");
    await submitFormByHeading("Edit Document copy");

    await waitForText("Updated price-list item: Document copy updated. The previous version was retained as inactive history.");
    await waitForText("6,25");

    const updateCall = fetchCalls.find((call) => call.method === "PATCH" && call.url === "/api/v1/price-list-items/price-admin-copy");
    expect(updateCall?.body).toMatchObject({
      description: "Document copy updated",
      unitPriceBrl: 6.25,
    });
  });

  it("deactivates and reactivates a price-list item", async () => {
    mockPriceListFetch();

    renderPage();

    await waitForText("Document copy");
    await clickButton("Deactivate");
    await waitForText("Deactivated price-list item: Document copy.");
    expect(fetchCalls.some((call) => call.url === "/api/v1/price-list-items/price-admin-copy/deactivate")).toBe(true);

    await clickCheckbox("Include inactive");
    await waitForText("Reactivate");
    await clickButton("Reactivate");
    await waitForText("Reactivated price-list item: Document copy.");
    expect(fetchCalls.some((call) => call.url === "/api/v1/price-list-items/price-admin-copy/reactivate")).toBe(true);
  });
});

function mockPriceListFetch() {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);
    const method = methodOf(init);
    const parsedUrl = new URL(url, "http://localhost");
    const path = parsedUrl.pathname.replace(/^\/api\/v1/, "");

    if (path === "/price-list-items" && method === "GET") {
      const includeInactive = parsedUrl.searchParams.get("includeInactive") === "true";
      const itemType = parsedUrl.searchParams.get("itemType");
      return jsonResponse({
        data: rows.filter((row) =>
          (includeInactive || row.active) && (!itemType || row.itemType === itemType),
        ),
      });
    }

    if (path === "/price-list-items" && method === "POST") {
      const body = parseBody(init?.body) as {
        itemType: string;
        code: string;
        description: string;
        unitPriceBrl: number;
        sortOrder: number;
      };
      const created: PriceListItem = {
        id: `price-${body.code}`,
        tenantId: "default",
        itemType: body.itemType,
        code: body.code.toUpperCase(),
        description: body.description,
        unitPriceBrl: body.unitPriceBrl,
        active: true,
        sortOrder: body.sortOrder,
        createdAt: "2026-06-22T12:00:00Z",
        updatedAt: "2026-06-22T12:00:00Z",
      };
      rows = [created, ...rows];
      return jsonResponse({ data: created }, { status: 201 });
    }

    const updateMatch = path.match(/^\/price-list-items\/([^/]+)$/);
    if (updateMatch && method === "PATCH") {
      const id = decodeURIComponent(updateMatch[1]);
      const existing = rows.find((row) => row.id === id);
      if (!existing) return jsonResponse({ error: { message: "Not found" } }, { status: 404 });
      const body = parseBody(init?.body) as {
        itemType: string;
        code: string;
        description: string;
        unitPriceBrl: number;
        sortOrder: number;
      };
      const replacement: PriceListItem = {
        ...existing,
        id: `${id}-revision`,
        itemType: body.itemType,
        code: body.code.toUpperCase(),
        description: body.description,
        unitPriceBrl: body.unitPriceBrl,
        sortOrder: body.sortOrder,
        active: true,
        supersededPriceListItemId: id,
        createdAt: "2026-06-23T12:00:00Z",
        updatedAt: "2026-06-23T12:00:00Z",
      };
      rows = rows.map((row) => (row.id === id ? { ...row, active: false } : row));
      rows = [replacement, ...rows];
      return jsonResponse({ data: replacement });
    }

    const deactivateMatch = path.match(/^\/price-list-items\/([^/]+)\/deactivate$/);
    if (deactivateMatch && method === "PATCH") {
      const id = decodeURIComponent(deactivateMatch[1]);
      rows = rows.map((row) => (row.id === id ? { ...row, active: false } : row));
      return jsonResponse({ data: rows.find((row) => row.id === id) });
    }

    const reactivateMatch = path.match(/^\/price-list-items\/([^/]+)\/reactivate$/);
    if (reactivateMatch && method === "PATCH") {
      const id = decodeURIComponent(reactivateMatch[1]);
      const target = rows.find((row) => row.id === id);
      if (!target) return jsonResponse({ error: { message: "Not found" } }, { status: 404 });
      rows = rows.map((row) =>
        row.itemType === target.itemType && row.code === target.code
          ? { ...row, active: row.id === id }
          : row,
      );
      return jsonResponse({ data: rows.find((row) => row.id === id) });
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/admin/price-list-items", element: <PriceListPage /> }],
    { initialEntries: ["/admin/price-list-items"] },
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
    body: parseBody(init?.body),
  });
}

function methodOf(init?: RequestInit) {
  return init?.method?.toUpperCase() ?? "GET";
}

function parseBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string" || !body) return undefined;
  return JSON.parse(body);
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function waitForText(text: string) {
  const timeoutAt = Date.now() + 1500;
  while (Date.now() < timeoutAt) {
    if (textNode(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Text not found: ${text}`);
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("*")).find((element) =>
    element.textContent?.includes(text),
  );
}

async function changeInputInForm(headingText: string, labelText: string, value: string) {
  const form = formByHeading(headingText);
  const input = controlByLabel<HTMLInputElement>(form, labelText, "input");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeSelectInForm(headingText: string, labelText: string, value: string) {
  const form = formByHeading(headingText);
  const select = controlByLabel<HTMLSelectElement>(form, labelText, "select");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;

  await act(async () => {
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitFormByHeading(headingText: string) {
  const form = formByHeading(headingText);

  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Button not found: ${name}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickCheckbox(labelText: string) {
  const label = Array.from(container.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(labelText),
  );
  const input = label?.querySelector("input[type='checkbox']") as HTMLInputElement | null;
  if (!input) throw new Error(`Checkbox not found: ${labelText}`);

  await act(async () => {
    input.click();
  });
}

function formByHeading(headingText: string) {
  const heading = Array.from(container.querySelectorAll("h2")).find((element) =>
    element.textContent?.includes(headingText),
  );
  const form = heading?.closest("form");
  if (!form) throw new Error(`Could not find form for heading ${headingText}`);
  return form;
}

function controlByLabel<T extends HTMLElement>(
  rootElement: ParentNode,
  labelText: string,
  selector: "input" | "select",
) {
  const label = Array.from(rootElement.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(labelText),
  );
  const control = label?.querySelector(selector);
  if (!control) throw new Error(`Could not find ${selector} for label ${labelText}`);
  return control as unknown as T;
}

function resetLocalStorage() {
  window.localStorage.removeItem("ers.authzAdmin.requestActor");
}
