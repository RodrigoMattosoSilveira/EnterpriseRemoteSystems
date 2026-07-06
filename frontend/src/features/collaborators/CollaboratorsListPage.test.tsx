import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollaboratorsListPage } from "./CollaboratorsListPage";
import type { Collaborator } from "../../types/collaborators";

const collaborators: Collaborator[] = [
  {
    id: "collab-1",
    tenantId: "default",
    personId: "person-1",
    personName: "Ana Silva",
    personNickname: "Ana",
    journeyStartDate: "2026-05-01",
    defaultEndDate: "2026-07-30",
    extensionDays: 0,
    projectedEndDate: "2026-07-30",
    paymentMethodId: "ref-method-daily",
    paymentMethodLabel: "Daily Rate",
    paymentValue: 125,
    planningAvailability: "ACTIVE",
    sectorId: "ref-sector-mining",
    sectorLabel: "Mining",
    locationId: "ref-location-carara",
    locationLabel: "Mina Carara",
    taskId: "ref-task-operator",
    taskLabel: "Operator",
    statusId: "ref-collaborator-active",
    statusLabel: "Active",
    createdAt: "2026-05-01T00:00:00Z",
    updatedAt: "2026-05-01T00:00:00Z",
  },
];

const filteredCollaborators: Collaborator[] = [
  {
    ...collaborators[0],
    id: "collab-filtered",
    personId: "person-filtered",
    personName: "Bruno Costa",
    personNickname: "Mineiro",
  },
];

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

describe("CollaboratorsListPage", () => {
  it("lists collaborator journeys", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators") {
        return jsonResponse({ data: { items: collaborators, total: 1 } });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage();

    await waitForText("Ana");
    expect(textNode("Ana Silva")).toBeTruthy();
    expect(textNode("Collaborator Journeys")).toBeTruthy();
    expect(textNode("Operator")).toBeTruthy();
    expect(textNode("Mining · Mina Carara")).toBeTruthy();
    expect(textNode("Daily Rate")).toBeTruthy();
    expect(textNode("$125.00")).toBeTruthy();
    expect(textNode("Active")).toBeTruthy();
  });

  it("requests filtered collaborator journeys from the URL search term", async () => {
    const urls: string[] = [];
    mockFetch(async (url) => {
      urls.push(url);
      if (url === "/api/v1/collaborators?search=Mineiro") {
        return jsonResponse({
          data: { items: filteredCollaborators, total: 1 },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage("/collaborators?search=Mineiro");

    await waitForText("Bruno Costa");
    expect(urls).toContain("/api/v1/collaborators?search=Mineiro");
    expect(textNode("Filtering by “Mineiro”.")).toBeTruthy();
    expect(textNode("Mineiro")).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>("#collaborator-search")?.value,
    ).toBe("Mineiro");
  });

  it("shows a filtered empty state", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators?search=Missing") {
        return jsonResponse({ data: { items: [], total: 0 } });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage("/collaborators?search=Missing");

    await waitForText("No collaborators match this filter");
    expect(textNode("Try another name or nickname.")).toBeTruthy();
  });

  it("shows an empty state", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators") {
        return jsonResponse({ data: { items: [], total: 0 } });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage();

    await waitForText("No collaborators yet");
    expect(textNode("Create a Collaborator after the related Person profile is complete.")).toBeTruthy();
  });

  it("shows backend errors", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators") {
        return jsonResponse(
          {
            error: {
              code: "internal_error",
              message: "Could not list collaborators",
            },
          },
          { status: 500 }
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage();

    await waitForText("Could not list collaborators");
    expect(textNode("Status: 500 · Code: internal_error")).toBeTruthy();
  });
});

function renderCollaboratorsListPage(initialEntry = "/collaborators") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/collaborators", element: <CollaboratorsListPage /> }],
    { initialEntries: [initialEntry] }
  );

  root = createRoot(container);

  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );
  });
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Promise<Response>
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url, init);
    }
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

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error("Timed out waiting for assertion");
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("*")).find((element) =>
    element.textContent?.includes(text)
  );
}
