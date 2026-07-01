import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MineProductionPage } from "./MineProductionPage";
import type { GoldProductionEntry } from "../../types/accruals";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

let root: Root | null;
let container: HTMLDivElement;
let fetchCalls: FetchCall[];
let entries: GoldProductionEntry[];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchCalls = [];
  entries = [
    {
      id: "gp-1",
      tenantId: "default",
      workPeriodId: "wp-1",
      locationId: "well-1",
      locationLabel: "Well 1",
      productionDate: "2026-06-07",
      goldGramsProduced: 12.5,
      active: true,
      notes: "Morning production",
      createdAt: "x",
      updatedAt: "x",
    },
  ];
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("MineProductionPage", () => {
  it("records Gold Production through the dedicated authorized workflow", async () => {
    mockFetch();
    renderPage();

    await waitForText("Gold Production");
    await waitForText("12.50000000 g");
    await changeSelectByIndex(1, "well-1");
    await changeInputByIndex(1, "13.25");
    await changeTextArea("Afternoon production");
    await clickButton("Record Production");

    await waitForText("13.25000000 g");
    const createCall = fetchCalls.find((call) => call.method === "POST");
    expect(createCall?.url).toBe(
      "/api/v1/work-periods/wp-1/gold-production-entries",
    );
    expect(createCall?.body).toMatchObject({
      locationId: "well-1",
      productionDate: "2026-06-07",
      goldGramsProduced: 13.25,
      notes: "Afternoon production",
    });
  });

  it("edits an existing Gold Production entry outside the Accrual tab", async () => {
    mockFetch();
    renderPage();

    await waitForText("Morning production");
    await clickButton("Edit");
    await waitForText("Edit Gold Production");
    await changeInputByIndex(1, "14.75");
    await changeTextArea("Corrected production");
    await clickButton("Save Production");

    await waitForText("14.75000000 g");
    const updateCall = fetchCalls.find((call) => call.method === "PATCH");
    expect(updateCall?.url).toBe("/api/v1/gold-production-entries/gp-1");
    expect(updateCall?.body).toMatchObject({
      locationId: "well-1",
      productionDate: "2026-06-07",
      goldGramsProduced: 14.75,
      notes: "Corrected production",
    });
  });
});

function mockFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      fetchCalls.push({ url, method, body });

      if (url.startsWith("/api/v1/work-periods?") && method === "GET") {
        return response({
          items: [
            {
              id: "wp-1",
              tenantId: "default",
              workDate: "2026-06-07",
              periodCode: "DAY",
              name: "06:00-18:00",
              startsAt: "2026-06-07T06:00:00Z",
              endsAt: "2026-06-07T18:00:00Z",
              status: "ACCRUAL_OPEN",
              createdAt: "x",
              updatedAt: "x",
            },
          ],
          total: 1,
          page: 1,
          pageSize: 200,
        });
      }
      if (url === "/api/v1/work-periods/wp-1" && method === "GET") {
        return response({
          id: "wp-1",
          tenantId: "default",
          workDate: "2026-06-07",
          periodCode: "DAY",
          name: "06:00-18:00",
          startsAt: "2026-06-07T06:00:00Z",
          endsAt: "2026-06-07T18:00:00Z",
          status: "ACCRUAL_OPEN",
          createdAt: "x",
          updatedAt: "x",
        });
      }
      if (url === "/api/v1/reference-data/location" && method === "GET") {
        return response([
          {
            id: "well-1",
            tenantId: "default",
            type: "location",
            code: "WELL_1",
            label: "Well 1",
            description: "",
            active: true,
            sortOrder: 1,
          },
        ]);
      }
      if (
        url ===
          "/api/v1/work-periods/wp-1/gold-production-entries?pageSize=100" &&
        method === "GET"
      ) {
        return response({
          items: entries,
          total: entries.length,
          page: 1,
          pageSize: 100,
        });
      }
      if (
        url === "/api/v1/work-periods/wp-1/gold-production-entries" &&
        method === "POST"
      ) {
        const created = {
          id: "gp-created",
          tenantId: "default",
          workPeriodId: "wp-1",
          active: true,
          createdAt: "x",
          updatedAt: "x",
          ...body,
          locationLabel: "Well 1",
        } as GoldProductionEntry;
        entries = [...entries, created];
        return response(created, 201);
      }
      if (
        url === "/api/v1/gold-production-entries/gp-1" &&
        method === "PATCH"
      ) {
        entries = entries.map((entry) =>
          entry.id === "gp-1"
            ? ({
                ...entry,
                ...body,
                locationLabel: "Well 1",
              } as GoldProductionEntry)
            : entry,
        );
        return response(entries.find((entry) => entry.id === "gp-1"));
      }
      throw new Error(`Unhandled request ${method} ${url}`);
    }),
  );
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/gold-production", element: <MineProductionPage /> }],
    { initialEntries: ["/gold-production?workPeriodId=wp-1"] },
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

function response(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function waitForText(text: string) {
  for (let i = 0; i < 50; i += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Missing text: ${text}`);
}

async function changeSelectByIndex(index: number, value: string) {
  const select = container.querySelectorAll("select").item(index);
  if (!select) throw new Error(`Missing select at index ${index}`);
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeInputByIndex(index: number, value: string) {
  const input = container.querySelectorAll("input").item(index);
  if (!input) throw new Error(`Missing input at index ${index}`);
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function changeTextArea(value: string) {
  const textarea = container.querySelector("textarea");
  if (!textarea) throw new Error("Missing textarea");
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Missing button: ${name}`);
  await act(async () => {
    button.click();
  });
}
