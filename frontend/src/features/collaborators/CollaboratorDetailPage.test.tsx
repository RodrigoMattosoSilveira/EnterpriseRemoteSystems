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
  personName: "Ana Silva",
  personNickname: "Ana",
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

    await waitForText("Ana");

    expect(textNode("Collaborator Journey")).toBeTruthy();
    expect(textNode("Person Summary")).toBeTruthy();
    expect(textNode("Nickname")).toBeTruthy();
    expect(textNode("Legal Name")).toBeTruthy();
    expect(textNode("Ana Silva")).toBeTruthy();
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
    expect(textNode("R$")).toBeTruthy();
    expect(textNode("125,00")).toBeTruthy();
    expect(textNode("Primary mine operator.")).toBeTruthy();
  });

  it("edits collaborator assignment, payment, and extension days", async () => {
    let updatePayload: Record<string, unknown> | undefined;

    mockFetch(async (url, init) => {
      if (url === "/api/v1/collaborators/collab-1" && init?.method === "PUT") {
        updatePayload = JSON.parse(String(init.body)) as Record<
          string,
          unknown
        >;
        return jsonResponse({
          data: {
            ...collaborator,
            sectorId: "ref-sector-processing",
            sectorLabel: "Processing",
            locationId: "ref-location-north-pit",
            locationLabel: "North Pit",
            taskId: "ref-task-supervisor",
            taskLabel: "Supervisor",
            paymentMethodId: "ref-method-salary",
            paymentMethodLabel: "Salary",
            paymentValue: 2400,
            fixedMonthlyBrlAmount: 2400,
            dailyBrlAmount: undefined,
            extensionDays: 12,
            projectedEndDate: "2026-08-11",
          },
        });
      }

      if (url === "/api/v1/collaborators/collab-1") {
        return jsonResponse({ data: collaborator });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorDetailPage("/collaborators/collab-1");

    await waitForText("Ana");

    await act(async () => {
      buttonByText("Edit Collaborator")?.click();
    });

    await waitForText("Save Collaborator");

    changeSelect("Sector", "ref-sector-processing");
    changeSelect("Location", "ref-location-north-pit");
    changeSelect("Task", "ref-task-supervisor");
    changeSelect("Payment Method", "ref-method-salary");
    changeInput("Payment Value", "2400");
    changeInput("Extension Days", "12");

    await act(async () => {
      buttonByText("Save Collaborator")?.click();
    });

    await waitForText("Collaborator updated for Ana.");

    expect(updatePayload).toMatchObject({
      sectorId: "ref-sector-processing",
      locationId: "ref-location-north-pit",
      taskId: "ref-task-supervisor",
      paymentMethodId: "ref-method-salary",
      paymentValue: 2400,
      fixedMonthlyBrlAmount: 2400,
      extensionDays: 12,
    });
    expect(updatePayload?.dailyBrlAmount).toBeUndefined();
  });

  it("refreshes seeded gold balance notes from the current settlement preview", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators/collab-1") {
        return jsonResponse({
          data: {
            ...collaborator,
            notes:
              "Manual test data: use Zero Gold. Gold balance starts at 8.500 grams.",
          },
        });
      }
      if (url === "/api/v1/collaborators/collab-1/settlement-preview") {
        return jsonResponse({
          data: {
            collaboratorId: "collab-1",
            brlBalance: 0,
            goldGramBalance: 6.5,
            pendingAccrualItems: 0,
            canClose: true,
            blockingReasons: [],
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorDetailPage("/collaborators/collab-1");

    await waitForText("Gold balance starts at 6.500 grams.");

    expect(textNode("Gold balance starts at 8.500 grams.")).toBeFalsy();
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
    expect(textNode("0 days remaining")).toBeTruthy();
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
      const referenceData = referenceDataResponse(url);
      if (referenceData) return referenceData;
      return handler(url, init);
    },
  );
}

function referenceDataResponse(url: string) {
  const responses: Record<string, unknown[]> = {
    "/api/v1/reference-data/method": [
      {
        id: "ref-method-daily",
        code: "DAILY",
        label: "Daily Rate",
        active: true,
        sortOrder: 10,
      },
      {
        id: "ref-method-salary",
        code: "SALARY",
        label: "Salary",
        active: true,
        sortOrder: 20,
      },
    ],
    "/api/v1/reference-data/sector": [
      {
        id: "ref-sector-mining",
        code: "MINING",
        label: "Mining",
        active: true,
        sortOrder: 10,
      },
      {
        id: "ref-sector-processing",
        code: "PROCESSING",
        label: "Processing",
        active: true,
        sortOrder: 20,
      },
    ],
    "/api/v1/reference-data/location": [
      {
        id: "ref-location-carara",
        code: "CARARA",
        label: "Mina Carara",
        active: true,
        sortOrder: 10,
      },
      {
        id: "ref-location-north-pit",
        code: "NORTH_PIT",
        label: "North Pit",
        active: true,
        sortOrder: 20,
      },
    ],
    "/api/v1/reference-data/task": [
      {
        id: "ref-task-operator",
        code: "OPERATOR",
        label: "Operator",
        active: true,
        sortOrder: 10,
      },
      {
        id: "ref-task-supervisor",
        code: "SUPERVISOR",
        label: "Supervisor",
        active: true,
        sortOrder: 20,
      },
    ],
  };

  if (!(url in responses)) return null;
  return jsonResponse({ data: responses[url] });
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
    element.textContent?.includes(text),
  );
}

function linkByText(text: string) {
  return Array.from(container.querySelectorAll("a")).find((element) =>
    element.textContent?.includes(text),
  );
}

function buttonByText(text: string) {
  return Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(text),
  );
}

function controlByLabel(labelText: string) {
  const label = Array.from(container.querySelectorAll("label")).find(
    (element) => element.textContent?.includes(labelText),
  );
  const control = label?.querySelector("input, select");
  if (!control) {
    throw new Error(`Control not found for label: ${labelText}`);
  }
  return control;
}

function changeSelect(label: string, value: string) {
  const select = controlByLabel(label) as HTMLSelectElement;
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function changeInput(label: string, value: string) {
  const input = controlByLabel(label) as HTMLInputElement;
  act(() => {
    setNativeValue(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setNativeValue(element: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
  const prototype = Object.getPrototypeOf(element) as HTMLInputElement;
  const prototypeValueSetter = Object.getOwnPropertyDescriptor(
    prototype,
    "value",
  )?.set;

  if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
    prototypeValueSetter.call(element, value);
    return;
  }

  valueSetter?.call(element, value);
}
