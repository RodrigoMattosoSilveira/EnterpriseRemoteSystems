import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AddPersonMembershipPage } from "./AddPersonMembershipPage";

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: string[];

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchCalls = [];
});

afterEach(async () => {
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
  });
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.removeChild(container);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AddPersonMembershipPage", () => {
  it("carries a tenant-list search into the global Person lookup", async () => {
    mockFetch();
    renderRoute("/people/add-existing?search=pj%40example.com");

    expect(inputByLabel("Find Person").value).toBe("pj@example.com");

    act(() => vi.advanceTimersByTime(350));

    await waitFor(() =>
      fetchCalls.includes(
        "/api/v1/people/global?search=pj%40example.com&page=1&pageSize=25",
      ),
    );
  });
});

function renderRoute(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const router = createMemoryRouter(
    [{ path: "/people/add-existing", element: <AddPersonMembershipPage /> }],
    { initialEntries: [initialEntry] },
  );

  root = createRoot(container);
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
}

function mockFetch() {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push(url);

      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({
          data: [
            {
              id: "ref-person-status-active",
              tenantId: "default",
              type: "person_status",
              code: "ACTIVE",
              label: "Active",
              active: true,
              sortOrder: 1,
            },
          ],
        });
      }
      if (url.startsWith("/api/v1/people/global?")) {
        return jsonResponse({ data: { items: [], total: 0 } });
      }

      throw new Error(`Unhandled request: ${url}`);
    },
  );
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function inputByLabel(labelText: string) {
  const labels = Array.from(container.querySelectorAll("label"));
  const label = labels.find((node) => node.textContent?.includes(labelText));
  const input = label?.querySelector("input");
  if (!input) throw new Error(`Could not find input for label ${labelText}`);
  return input;
}

async function waitFor(assertion: () => boolean) {
  const timeoutAt = Date.now() + 1000;
  while (Date.now() < timeoutAt) {
    let passed = false;
    await act(async () => {
      passed = assertion();
      await Promise.resolve();
    });
    if (passed) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error("Timed out waiting for assertion");
}
