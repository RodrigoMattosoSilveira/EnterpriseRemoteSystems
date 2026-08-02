import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GoldPricesPage } from "./GoldPricesPage";
import type { GoldPrice } from "../../types/goldPrices";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

const baseRows: GoldPrice[] = [
  {
    id: "gold-price-2026-06-21",
    tenantId: "default",
    priceDate: "2026-06-21",
    brlPerGram: 500,
    recordedBy: "admin-user",
    notes: "Daily admin rate",
    active: true,
    createdAt: "2026-06-21T12:00:00Z",
    updatedAt: "2026-06-21T12:00:00Z",
  },
  {
    id: "gold-price-2026-06-20",
    tenantId: "default",
    priceDate: "2026-06-20",
    brlPerGram: 490,
    recordedBy: "admin-user",
    notes: "Prior rate",
    active: true,
    createdAt: "2026-06-20T12:00:00Z",
    updatedAt: "2026-06-20T12:00:00Z",
  },
];

let rows: GoldPrice[];
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

describe("GoldPricesPage", () => {
  it("shows the latest active gold price as the conversion source", async () => {
    mockGoldPriceFetch();

    renderPage();

    await waitForText("Current Conversion Source");
    await waitForText("500,00");
    await waitForText("BRL ÷ 500 = grams");
    await waitForText("Daily admin rate");

    expect(fetchCalls.some((call) => call.url === "/api/v1/gold-prices/latest" && call.method === "GET")).toBe(true);
    expect(fetchCalls.some((call) => call.url === "/api/v1/gold-prices" && call.method === "GET")).toBe(true);
  });

  it("records a new administrator gold price", async () => {
    mockGoldPriceFetch();

    renderPage();

    await waitForText("Daily admin rate");
    await changeInputInForm("Record Gold Price", "Price Date", "2026-06-22");
    await changeInputInForm("Record Gold Price", "BRL per Gram", "525.75");
    await changeTextAreaInForm("Record Gold Price", "Notes", "Manual admin quote");
    await submitFormByHeading("Record Gold Price");

    await waitForText("Gold price for 2026-06-22 recorded.");

    const createCall = fetchCalls.find((call) => call.method === "POST");
    expect(createCall?.url).toBe("/api/v1/gold-prices");
    expect(createCall?.body).toMatchObject({
      priceDate: "2026-06-22",
      brlPerGram: 525.75,
      recordedBy: "bootstrap-admin",
      notes: "Manual admin quote",
    });
  });

  it("replaces an existing same-date gold price without showing a server error", async () => {
    mockGoldPriceFetch();

    renderPage();

    await waitForText("Daily admin rate");
    await changeInputInForm("Record Gold Price", "Price Date", "2026-06-21");
    await changeInputInForm("Record Gold Price", "BRL per Gram", "501.25");
    await changeTextAreaInForm("Record Gold Price", "Notes", "Corrected daily quote");
    await submitFormByHeading("Record Gold Price");

    await waitForText("Gold price for 2026-06-21 replaced. Previous value was deactivated and retained for audit history.");

    const createCall = fetchCalls.find((call) => call.method === "POST");
    expect(createCall?.url).toBe("/api/v1/gold-prices");
    expect(textNode("Unexpected server error")).toBeUndefined();

    await clickCheckbox("Include inactive");
    await waitForText("Inactive");
  });

  it("deactivates a gold price and can include inactive records", async () => {
    mockGoldPriceFetch();

    renderPage();

    await waitForText("Daily admin rate");
    await clickButton("Deactivate");
    await waitForText("Gold price for 2026-06-21 deactivated.");

    const deactivateCall = fetchCalls.find((call) => call.method === "PATCH");
    expect(deactivateCall?.url).toBe("/api/v1/gold-prices/gold-price-2026-06-21/deactivate");

    await clickCheckbox("Include inactive");
    await waitForText("Inactive");
    expect(fetchCalls.some((call) => call.url === "/api/v1/gold-prices?includeInactive=true")).toBe(true);
  });
});

function mockGoldPriceFetch() {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);
    const method = methodOf(init);

    if (url === "/api/v1/authz/current-actor" && method === "GET") {
      return jsonResponse({
        data: {
          actorKey: "bootstrap-admin",
          actorRecordId: "actor-bootstrap-admin",
          tenantId: "default",
          scope: "APPLICATION",
          roleCodes: ["APPLICATION_ADMIN"],
          permissions: ["*"],
        },
      });
    }

    if (url === "/api/v1/gold-prices/latest" && method === "GET") {
      const latest = latestActiveGoldPrice();
      if (!latest) {
        return jsonResponse({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
      }
      return jsonResponse({ data: latest });
    }

    if ((url === "/api/v1/gold-prices" || url === "/api/v1/gold-prices?includeInactive=true") && method === "GET") {
      const includeInactive = url.includes("includeInactive=true");
      return jsonResponse({ data: includeInactive ? rows : rows.filter((row) => row.active) });
    }

    if (url === "/api/v1/gold-prices" && method === "POST") {
      const body = parseBody(init?.body) as { priceDate: string; brlPerGram: number; recordedBy: string; notes?: string };
      const existingActive = rows.find((row) => row.priceDate === body.priceDate && row.active);
      const created: GoldPrice = {
        id: existingActive ? `gold-price-${body.priceDate}-replacement` : `gold-price-${body.priceDate}`,
        tenantId: "default",
        priceDate: body.priceDate,
        brlPerGram: body.brlPerGram,
        recordedBy: body.recordedBy,
        notes: body.notes,
        active: true,
        createdAt: existingActive ? `${body.priceDate}T13:00:00Z` : `${body.priceDate}T12:00:00Z`,
        updatedAt: existingActive ? `${body.priceDate}T13:00:00Z` : `${body.priceDate}T12:00:00Z`,
        supersededGoldPriceId: existingActive?.id,
      };
      rows = [created, ...rows.map((row) => (
        row.id === existingActive?.id ? { ...row, active: false, updatedAt: created.updatedAt } : row
      ))];
      return jsonResponse({ data: created }, { status: 201 });
    }

    if (url === "/api/v1/gold-prices/gold-price-2026-06-21/deactivate" && method === "PATCH") {
      rows = rows.map((row) =>
        row.id === "gold-price-2026-06-21" ? { ...row, active: false } : row,
      );
      return jsonResponse({ data: rows.find((row) => row.id === "gold-price-2026-06-21") });
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

function latestActiveGoldPrice() {
  return [...rows]
    .filter((row) => row.active)
    .sort((a, b) => b.priceDate.localeCompare(a.priceDate) || b.createdAt.localeCompare(a.createdAt))[0];
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/admin/gold-prices", element: <GoldPricesPage /> }],
    { initialEntries: ["/admin/gold-prices"] },
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

async function changeTextAreaInForm(headingText: string, labelText: string, value: string) {
  const form = formByHeading(headingText);
  const textArea = controlByLabel<HTMLTextAreaElement>(form, labelText, "textarea");
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;

  await act(async () => {
    valueSetter?.call(textArea, value);
    textArea.dispatchEvent(new Event("input", { bubbles: true }));
    textArea.dispatchEvent(new Event("change", { bubbles: true }));
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
  selector: "input" | "textarea",
) {
  const label = Array.from(rootElement.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(labelText),
  );
  const control = label?.querySelector(selector);
  if (!control) throw new Error(`Could not find ${selector} for label ${labelText}`);
  return control as unknown as T;
}

function resetLocalStorage() {
  window.localStorage.removeItem("ers.auth.selectedTenantId");
}
