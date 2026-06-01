import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Collaborator } from "../../types/collaborators";
import { CollaboratorDetailPage } from "./CollaboratorDetailPage";

const collaborator: Collaborator = {
  id: "collab-1",
  tenantId: "default",
  personId: "person-1",
  personName: "Ana Silva (Ana)",
  journeyStartDate: "2026-05-01",
  defaultEndDate: "2026-07-30",
  extensionDays: 5,
  projectedEndDate: "2026-08-04",
  paymentMethodId: "ref-method-daily",
  paymentMethodLabel: "Daily Rate",
  paymentValue: 125,
  sectorId: "ref-sector-mining",
  sectorLabel: "Mining",
  locationId: "ref-location-carara",
  locationLabel: "Mina Carara",
  taskId: "ref-task-operator",
  taskLabel: "Operator",
  statusId: "ref-collaborator-active",
  statusLabel: "Active",
  notes: "Primary mine operator.",
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
};

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
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

describe("CollaboratorDetailPage", () => {
  it("shows collaborator journey details", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators/collab-1") {
        return jsonResponse({ data: collaborator });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorDetailPage("/collaborators/collab-1");

    await waitForText("Ana Silva (Ana)");

    expect(textNode("Collaborator Journey")).toBeTruthy();
    expect(textNode("Person Summary")).toBeTruthy();
    expect(linkByText("View Person")?.getAttribute("href")).toBe(
      "/people/person-1",
    );
    expect(textNode("Lifecycle")).toBeTruthy();
    expect(textNode("Journey Start")).toBeTruthy();
    expect(textNode("2026-05-01")).toBeTruthy();
    expect(textNode("Default End")).toBeTruthy();
    expect(textNode("2026-07-30")).toBeTruthy();
    expect(textNode("Extension Days")).toBeTruthy();
    expect(textNode("5")).toBeTruthy();
    expect(textNode("Projected End")).toBeTruthy();
    expect(textNode("2026-08-04")).toBeTruthy();
    expect(textNode("Work Assignment")).toBeTruthy();
    expect(textNode("Mining")).toBeTruthy();
    expect(textNode("Mina Carara")).toBeTruthy();
    expect(textNode("Operator")).toBeTruthy();
    expect(textNode("Payment")).toBeTruthy();
    expect(textNode("Daily Rate")).toBeTruthy();
    expect(textNode("$125.00")).toBeTruthy();
    expect(textNode("Primary mine operator.")).toBeTruthy();
  });

  it("shows closed lifecycle state", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators/collab-closed") {
        return jsonResponse({
          data: {
            ...collaborator,
            id: "collab-closed",
            closedAt: "2026-06-15T10:00:00Z",
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorDetailPage("/collaborators/collab-closed");

    await waitForText("Closed");
    expect(textNode("2026-06-15T10:00:00Z")).toBeTruthy();
  });

  it("shows backend errors", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators/missing") {
        return jsonResponse(
          {
            error: {
              code: "not_found",
              message: "Collaborator not found",
            },
          },
          { status: 404 },
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorDetailPage("/collaborators/missing");

    await waitForText("Collaborator not found");
    expect(textNode("Status: 404 · Code: not_found")).toBeTruthy();
  });
});

function renderCollaboratorDetailPage(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/collaborators/:id", element: <CollaboratorDetailPage /> }],
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

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>,
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url, init);
    },
  );
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

async function waitForText(text: string) {
  await waitFor(() => Boolean(textNode(text)));
}

async function waitFor(assertion: () => boolean) {
  const timeoutAt = Date.now() + 1500;
  let lastError: unknown;

  while (Date.now() < timeoutAt) {
    try {
      let passed = false;
      await act(async () => {
        passed = assertion();
      });
      if (passed) return;
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Timed out waiting for assertion");
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("*")).find((element) =>
    element.textContent?.includes(text),
  );
}

function linkByText(text: string) {
  return Array.from(container.querySelectorAll("a")).find((element) =>
    element.textContent?.includes(text),
  );
}
