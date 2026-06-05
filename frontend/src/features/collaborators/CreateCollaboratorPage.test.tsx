import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateCollaboratorPage } from "./CreateCollaboratorPage";
import type { Person } from "../../types/people";
import type { Collaborator } from "../../types/collaborators";
import type { ReferenceDataItem } from "../../types/referenceData";

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
};

const completePerson: Person = {
  id: "person-complete-1",
  firstName: "Ana",
  lastName: "Silva",
  nickname: "Ana",
  cpf: "93541134780",
  rg: "RG-1",
  cellular: "11987654321",
  email: "ana@example.com",
  country: "Brasil",
  profileCompletionStatus: "COMPLETE",
  canCreateCollaborator: true,
  missingSections: [],
  statusId: "ref-person-status-active",
};

const secondCompletePerson: Person = {
  id: "person-complete-2",
  firstName: "Carla",
  lastName: "Moura",
  nickname: "Carla",
  cpf: "14671029880",
  rg: "RG-3",
  cellular: "13987654321",
  email: "carla@example.com",
  country: "Brasil",
  profileCompletionStatus: "COMPLETE",
  canCreateCollaborator: true,
  missingSections: [],
  statusId: "ref-person-status-active",
};

const incompletePerson: Person = {
  id: "person-incomplete-1",
  firstName: "Bruno",
  lastName: "Costa",
  nickname: "Bruno",
  cpf: "35703599895",
  rg: "RG-2",
  cellular: "12987654321",
  email: "bruno@example.com",
  country: "Brasil",
  profileCompletionStatus: "INCOMPLETE",
  canCreateCollaborator: false,
  missingSections: ["Bank"],
  statusId: "ref-person-status-active",
};

const activeCollaboratorForSecondPerson: Collaborator = {
  id: "collab-active-1",
  tenantId: "default",
  personId: "person-complete-2",
  personName: "Carla Moura (Carla)",
  journeyStartDate: "2026-05-01",
  defaultEndDate: "2026-07-30",
  extensionDays: 0,
  projectedEndDate: "2026-07-30",
  paymentMethodId: "ref-method-daily",
  paymentMethodLabel: "Daily Rate",
  paymentValue: 125.5,
  sectorId: "ref-sector-mining",
  sectorLabel: "Mining",
  locationId: "ref-location-carara",
  locationLabel: "Mina Carara",
  taskId: "ref-task-operator",
  taskLabel: "Operator",
  statusId: "ref-collaborator-status-active",
  statusLabel: "Active",
  createdAt: "2026-05-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
};

const referenceRows: Record<string, ReferenceDataItem[]> = {
  method: [
    referenceItem(
      "ref-method-daily",
      "method",
      "DAILY",
      "Daily Rate",
      true,
      10,
    ),
    referenceItem(
      "ref-method-inactive",
      "method",
      "OLD",
      "Old Method",
      false,
      20,
    ),
  ],
  sector: [
    referenceItem("ref-sector-mining", "sector", "MINING", "Mining", true, 10),
  ],
  location: [
    referenceItem(
      "ref-location-carara",
      "location",
      "CARARA",
      "Mina Carara",
      true,
      10,
    ),
  ],
  task: [
    referenceItem(
      "ref-task-operator",
      "task",
      "OPERATOR",
      "Operator",
      true,
      10,
    ),
  ],
  collaborator_status: [
    referenceItem(
      "ref-collaborator-status-active",
      "collaborator_status",
      "ACTIVE",
      "Active",
      true,
      10,
    ),
  ],
};

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: FetchCall[];

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

describe("CreateCollaboratorPage", () => {
  it("loads only eligible people into the create form and hides incomplete people", async () => {
    mockCreateCollaboratorFetch();

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");
    expect(textNode("Carla Moura (Carla)")).toBeTruthy();
    expect(textNode("2 eligible")).toBeTruthy();
    expect(textNode("1 incomplete")).toBeTruthy();
    expect(selectOptions("Eligible Person")).toEqual([
      "Select an eligible Person",
      "Ana Silva (Ana)",
      "Carla Moura (Carla)",
    ]);
    expect(textNode("Bruno Costa")).toBeFalsy();
    expect(textNode("Active reference data")).toBeTruthy();
    expect(
      textNode("Only active reference data values are available"),
    ).toBeTruthy();
    expect(textNode("1 active · 1 inactive")).toBeTruthy();
    expect(textNode("Daily Rate")).toBeTruthy();
    expect(textNode("Old Method")).toBeFalsy();
    expect(selectOptions("Payment Method")).toEqual([
      "Select a payment method",
      "Daily Rate",
    ]);
    expect(textNode("Mining")).toBeTruthy();
    expect(textNode("Mina Carara")).toBeTruthy();
    expect(textNode("Operator")).toBeTruthy();
    expect(textNode("Active")).toBeTruthy();
  });

  it("excludes complete People who already have an active Collaborator", async () => {
    mockCreateCollaboratorFetch({
      collaborators: [activeCollaboratorForSecondPerson],
    });

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");

    expect(textNode("1 eligible")).toBeTruthy();
    expect(textNode("1 already collaborators")).toBeTruthy();
    expect(selectOptions("Eligible Person")).toEqual([
      "Select an eligible Person",
      "Ana Silva (Ana)",
    ]);
    expect(textNode("Search eligible People")).toBeFalsy();
    await waitForText(
      "Already active Collaborators are hidden from the dropdown.",
    );
    await waitForText("Carla Moura (Carla)");

    const carlaLinks = Array.from(container.querySelectorAll("a")).filter(
      (node) => node.textContent?.trim() === "Carla Moura (Carla)",
    );
    expect(carlaLinks[0]?.getAttribute("href")).toBe(
      "/people/person-complete-2",
    );
  });

  it("shows a setup warning and disables submission when a dropdown has no active reference data", async () => {
    mockCreateCollaboratorFetch({
      referenceData: {
        ...referenceRows,
        method: [
          referenceItem(
            "ref-method-inactive",
            "method",
            "OLD",
            "Old Method",
            false,
            20,
          ),
        ],
      },
    });

    renderCreateCollaboratorPage();

    await waitForText(
      "Active reference data is required before creating a Collaborator.",
    );
    await waitForText("Configure active values for: Payment Methods.");

    expect(selectOptions("Payment Method")).toEqual([
      "No active payment methods available",
    ]);
    expect(textNode("Old Method")).toBeFalsy();

    const submit = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "Create Collaborator",
    );
    expect(submit?.hasAttribute("disabled")).toBe(true);
  });

  it("shows selected complete Person details and a link to the Person", async () => {
    mockCreateCollaboratorFetch();

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");

    await changeSelect("Eligible Person", "person-complete-1");

    await waitForText("Selected Person is complete.");
    await waitForText("ana@example.com");
    await waitForText("11987654321");
    await waitForText("93541134780");
    await waitForText("COMPLETE");

    const viewLink = Array.from(container.querySelectorAll("a")).find(
      (node) => node.textContent?.trim() === "View Person",
    );
    expect(viewLink?.getAttribute("href")).toBe("/people/person-complete-1");
  });

  it("requires a complete Person and all required Collaborator fields before enabling submit", async () => {
    mockCreateCollaboratorFetch();

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");

    expect(submitButton().hasAttribute("disabled")).toBe(true);

    await changeSelect("Eligible Person", "person-complete-1");
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    await waitForText("Complete these fields to enable Create Collaborator:");
    await waitForText("Select a status");
    await waitForText("Select a sector");
    await waitForText("Select a location");
    await waitForText("Select a task");
    await waitForText("Select a payment method");
    await waitForText("Enter a payment value greater than zero");

    await changeSelect("Status", "ref-collaborator-status-active");
    await changeSelect("Sector", "ref-sector-mining");
    await changeSelect("Location", "ref-location-carara");
    await changeSelect("Task", "ref-task-operator");
    await changeSelect("Payment Method", "ref-method-daily");
    await changeInput("Payment Value", "125.50");

    expect(submitButton().hasAttribute("disabled")).toBe(false);
    expect(
      textNode("Complete these fields to enable Create Collaborator:"),
    ).toBeFalsy();
  });

  it("shows an empty eligible-Person state when all People are incomplete", async () => {
    mockCreateCollaboratorFetch({ people: [incompletePerson] });

    renderCreateCollaboratorPage();

    await waitForText("No eligible People are available.");
    await waitForText("0 eligible");
    await waitForText("1 incomplete");

    const submit = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.trim() === "Create Collaborator",
    );
    expect(submit?.hasAttribute("disabled")).toBe(true);
  });

  it("submits the collaborator create payload and navigates back to the list", async () => {
    mockCreateCollaboratorFetch();

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");

    await changeSelect("Eligible Person", "person-complete-1");
    await changeInput("Journey Start Date", "2026-05-29");
    await changeSelect("Status", "ref-collaborator-status-active");
    await changeSelect("Sector", "ref-sector-mining");
    await changeSelect("Location", "ref-location-carara");
    await changeSelect("Task", "ref-task-operator");
    await changeSelect("Payment Method", "ref-method-daily");
    await changeInput("Payment Value", "125.50");
    await changeTextarea("Notes", "First collaborator journey");
    await clickButton("Create Collaborator");

    await waitForText("Collaborators route reached");

    const createCall = fetchCalls.find((call) => call.method === "POST");
    expect(createCall?.url).toBe("/api/v1/collaborators");
    expect(createCall?.body).toMatchObject({
      personId: "person-complete-1",
      journeyStartDate: "2026-05-29",
      statusId: "ref-collaborator-status-active",
      sectorId: "ref-sector-mining",
      locationId: "ref-location-carara",
      taskId: "ref-task-operator",
      paymentMethodId: "ref-method-daily",
      paymentValue: 125.5,
      notes: "First collaborator journey",
    });
  });

  it("shows backend validation errors from the create endpoint", async () => {
    mockCreateCollaboratorFetch({
      createResponse: jsonResponse(
        {
          error: {
            code: "validation_failed",
            message: "Validation failed",
            fields: {
              statusId: "Collaborator status is required",
              paymentValue: "Payment value must be greater than zero",
              sectorId: "Sector is inactive or does not exist",
            },
          },
        },
        { status: 400 },
      ),
    });

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");

    await changeSelect("Eligible Person", "person-complete-1");
    await changeInput("Journey Start Date", "2026-05-29");
    await changeSelect("Status", "ref-collaborator-status-active");
    await changeSelect("Sector", "ref-sector-mining");
    await changeSelect("Location", "ref-location-carara");
    await changeSelect("Task", "ref-task-operator");
    await changeSelect("Payment Method", "ref-method-daily");
    await changeInput("Payment Value", "125.50");
    await clickButton("Create Collaborator");

    await waitForText("Validation failed");
    await waitForText("Status: 400 · Code: validation_failed");
    await waitForText("statusId:");
    await waitForText("Collaborator status is required");
    await waitForText("paymentValue:");
    await waitForText("Payment value must be greater than zero");
    await waitForText("sectorId:");
    await waitForText("Sector is inactive or does not exist");

    expect(textNode("Collaborators route reached")).toBeFalsy();
    expect(
      textNode("This Person already has an active Collaborator journey."),
    ).toBeFalsy();
  });

  it("shows backend incomplete Person validation errors if server rejects the selected Person", async () => {
    mockCreateCollaboratorFetch({
      createResponse: jsonResponse(
        {
          error: {
            code: "validation_failed",
            message: "Validation failed",
            fields: {
              personId:
                "Person profile is incomplete. Missing sections: Bank, Emergency.",
            },
          },
        },
        { status: 400 },
      ),
    });

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");

    await changeSelect("Eligible Person", "person-complete-1");
    await changeInput("Journey Start Date", "2026-05-29");
    await changeSelect("Status", "ref-collaborator-status-active");
    await changeSelect("Sector", "ref-sector-mining");
    await changeSelect("Location", "ref-location-carara");
    await changeSelect("Task", "ref-task-operator");
    await changeSelect("Payment Method", "ref-method-daily");
    await changeInput("Payment Value", "125.50");
    await clickButton("Create Collaborator");

    await waitForText("Validation failed");
    await waitForText("personId:");
    await waitForText(
      "Person profile is incomplete. Missing sections: Bank, Emergency.",
    );

    expect(textNode("Collaborators route reached")).toBeFalsy();
    expect(
      textNode("This Person already has an active Collaborator journey."),
    ).toBeFalsy();
  });

  it("shows a useful duplicate active Collaborator error", async () => {
    mockCreateCollaboratorFetch({
      createResponse: jsonResponse(
        {
          error: {
            code: "validation_failed",
            message: "Validation failed",
            fields: {
              personId: "Person already has an active collaborator journey",
            },
          },
        },
        { status: 400 },
      ),
    });

    renderCreateCollaboratorPage();

    await waitForText("Ana Silva (Ana)");

    await changeSelect("Eligible Person", "person-complete-1");
    await changeInput("Journey Start Date", "2026-05-29");
    await changeSelect("Status", "ref-collaborator-status-active");
    await changeSelect("Sector", "ref-sector-mining");
    await changeSelect("Location", "ref-location-carara");
    await changeSelect("Task", "ref-task-operator");
    await changeSelect("Payment Method", "ref-method-daily");
    await changeInput("Payment Value", "125.50");
    await clickButton("Create Collaborator");

    await waitForText(
      "This Person already has an active Collaborator journey.",
    );
    await waitForText("Person already has an active collaborator journey");
    await waitForText("Selected Person:");
    await waitForText("Ana Silva (Ana)");

    const collaboratorsLink = Array.from(container.querySelectorAll("a")).find(
      (node) => node.textContent?.trim() === "View Collaborators",
    );
    expect(collaboratorsLink?.getAttribute("href")).toBe("/collaborators");

    const personLink = Array.from(container.querySelectorAll("a")).find(
      (node) => node.textContent?.trim() === "View Person",
    );
    expect(personLink?.getAttribute("href")).toBe("/people/person-complete-1");
    expect(textNode("personId:")).toBeFalsy();
  });
});

function renderCreateCollaboratorPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [
      { path: "/collaborators/new", element: <CreateCollaboratorPage /> },
      {
        path: "/collaborators",
        element: <main>Collaborators route reached</main>,
      },
    ],
    { initialEntries: ["/collaborators/new"] },
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

function mockCreateCollaboratorFetch({
  createResponse,
  people = [completePerson, secondCompletePerson, incompletePerson],
  referenceData = referenceRows,
  collaborators = [],
}: {
  createResponse?: Response;
  people?: Person[];
  referenceData?: Record<string, ReferenceDataItem[]>;
  collaborators?: Collaborator[];
} = {}) {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);

    if (url.startsWith("/api/v1/people")) {
      return jsonResponse({ data: { items: people, total: people.length } });
    }

    if (url === "/api/v1/collaborators" && methodOf(init) === "GET") {
      return jsonResponse({
        data: { items: collaborators, total: collaborators.length },
      });
    }

    for (const [type, rows] of Object.entries(referenceData)) {
      if (url === `/api/v1/reference-data/${type}`) {
        return jsonResponse({ data: rows });
      }
    }

    if (url === "/api/v1/collaborators" && methodOf(init) === "POST") {
      return (
        createResponse ??
        jsonResponse(
          {
            data: {
              id: "collab-1",
              tenantId: "default",
              personId: "person-complete-1",
              personName: "Ana Silva (Ana)",
              journeyStartDate: "2026-05-29",
              defaultEndDate: "2026-08-27",
              extensionDays: 0,
              projectedEndDate: "2026-08-27",
              paymentMethodId: "ref-method-daily",
              paymentMethodLabel: "Daily Rate",
              paymentValue: 125.5,
              sectorId: "ref-sector-mining",
              sectorLabel: "Mining",
              locationId: "ref-location-carara",
              locationLabel: "Mina Carara",
              taskId: "ref-task-operator",
              taskLabel: "Operator",
              statusId: "ref-collaborator-status-active",
              statusLabel: "Active",
              notes: "First collaborator journey",
              createdAt: "2026-05-29T00:00:00Z",
              updatedAt: "2026-05-29T00:00:00Z",
            },
          },
          { status: 201 },
        )
      );
    }

    throw new Error(`Unhandled request: ${url}`);
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
  if (typeof body !== "string") return undefined;

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function referenceItem(
  id: string,
  type: string,
  code: string,
  label: string,
  active: boolean,
  sortOrder: number,
): ReferenceDataItem {
  return {
    id,
    tenantId: "default",
    type,
    code,
    label,
    active,
    sortOrder,
  };
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

function selectOptions(labelText: string) {
  const select = controlByLabel<HTMLSelectElement>(labelText, "select");
  return Array.from(select.options).map((option) => option.textContent ?? "");
}

async function changeSelect(labelText: string, value: string) {
  const select = controlByLabel<HTMLSelectElement>(labelText, "select");
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeInput(labelText: string, value: string) {
  const input = controlByLabel<HTMLInputElement>(labelText, "input");
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeTextarea(labelText: string, value: string) {
  const textarea = controlByLabel<HTMLTextAreaElement>(labelText, "textarea");
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Could not find button ${name}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function submitButton() {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === "Create Collaborator",
  );
  if (!button) throw new Error("Could not find Create Collaborator button");
  return button;
}

function controlByLabel<T extends HTMLElement>(
  labelText: string,
  selector: "input" | "select" | "textarea",
): T {
  const label = Array.from(container.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(labelText),
  );

  const control = label?.querySelector(selector);
  if (!control) {
    throw new Error(`Could not find ${selector} for label ${labelText}`);
  }

  return control as unknown as T;
}
