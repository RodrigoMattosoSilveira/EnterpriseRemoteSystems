import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PeopleListPage } from "./PeopleListPage";
import { PersonDetailPage } from "./PersonDetailPage";
import type { Person } from "../../types/people";

const PERSON_ID = "person-123";

const existingPerson: Person = {
  id: PERSON_ID,
  firstName: "Maria",
  lastName: "Silva",
  nickname: "Mari",
  cpf: "93541134780",
  rg: "RG-000001",
  cellular: "11987654321",
  email: "maria@example.com",
  street1: "Rua Um 123",
  street2: "Apto 4",
  state: "SP",
  cep: "01001000",
  city: "Sao Paulo",
  country: "Brasil",
  bankName: "Banco Teste",
  bankNumber: "001",
  checkingAccount: "12345-6",
  pixKey: "maria@example.com",
  emergencyName: "Joao Silva",
  emergencyCellular: "11912345678",
  emergencyEmail: "joao@example.com",
  profileCompletionStatus: "COMPLETE",
  canCreateCollaborator: true,
  missingSections: [],
  statusId: "ref-person-status-active",
  statusLabel: "Active",
  notes: "Original notes",
};

type FetchCall = {
  url: string;
  method: string;
  body?: unknown;
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

describe("PersonDetailPage", () => {
  it("loads an existing Person into the edit form", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute();

    await waitForText("Maria Silva");

    expect(inputByLabel("First Name").value).toBe("Maria");
    expect(inputByLabel("Last Name").value).toBe("Silva");
    expect(inputByLabel("Nickname").value).toBe("Mari");
    expect(inputByLabel("CPF").value).toBe("93541134780");
    expect(inputByLabel("RG").value).toBe("RG-000001");
    expect(inputByLabel("Cellular").value).toBe("11987654321");
    expect(inputByLabel("Email").value).toBe("maria@example.com");
    expect(selectByLabel("Status").value).toBe("ref-person-status-active");
  });

  it("submits edited Personal fields to the update endpoint", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "GET") {
        return jsonResponse({ data: existingPerson });
      }

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "PUT") {
        return jsonResponse({
          data: {
            ...existingPerson,
            firstName: "Mariana",
            cellular: "11999998888",
          },
        });
      }

      if (url === "/api/v1/people" && methodOf(init) === "GET") {
        return jsonResponse({ items: [], total: 0 });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute();
    await waitForText("Maria Silva");

    await changeInput("First Name", "Mariana");
    await changeInput("Cellular", "11999998888");
    await submitForm();

    await waitFor(() => fetchCalls.some((call) => call.method === "PUT"));

    const updateCall = fetchCalls.find((call) => call.method === "PUT");
    expect(updateCall?.url).toBe(`/api/v1/people/${PERSON_ID}`);
    expect(updateCall?.body).toMatchObject({
      firstName: "Mariana",
      lastName: "Silva",
      nickname: "Mari",
      cpf: "93541134780",
      rg: "RG-000001",
      cellular: "11999998888",
      email: "maria@example.com",
      statusId: "ref-person-status-active",
    });

    await waitForText("People");
  });

  it("submits status changes when editing a person", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "GET") {
        return jsonResponse({ data: existingPerson });
      }

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "PUT") {
        return jsonResponse({
          data: {
            ...existingPerson,
            statusId: "ref-person-status-inactive",
            statusLabel: "Inactive",
          },
        });
      }

      if (url === "/api/v1/people" && methodOf(init) === "GET") {
        return jsonResponse({ items: [], total: 0 });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute();
    await waitForText("Maria Silva");

    await changeSelect("Status", "ref-person-status-inactive");
    await submitForm();

    await waitFor(() => fetchCalls.some((call) => call.method === "PUT"));

    const updateCall = fetchCalls.find((call) => call.method === "PUT");
    expect(updateCall?.body).toMatchObject({
      statusId: "ref-person-status-inactive",
    });

    await waitForText("People");
  });

  it("shows update validation errors returned by the API", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "GET") {
        return jsonResponse({ data: existingPerson });
      }

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "PUT") {
        return jsonResponse(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "Validation failed",
              fields: {
                email: "Email already exists",
              },
            },
          },
          { status: 400 }
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute();
    await waitForText("Maria Silva");

    await changeInput("Email", "duplicate@example.com");
    await submitForm();

    await waitFor(() => fetchCalls.some((call) => call.method === "PUT"));

    await waitForText("Validation failed");
    await waitForText("email:");
    await waitForText("Email already exists");

    expect(inputByLabel("Email").value).toBe("duplicate@example.com");
  });
});

function renderPersonDetailRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [
      { path: "/people", element: <PeopleListPage /> },
      { path: "/people/:id", element: <PersonDetailPage /> },
    ],
    { initialEntries: [`/people/${PERSON_ID}`] }
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

async function waitForText(text: string) {
  await waitFor(() => Boolean(textNode(text)));
}

async function waitFor(assertion: () => boolean) {
  const timeoutAt = Date.now() + 1000;
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

function inputByLabel(labelText: string) {
  return controlByLabel<HTMLInputElement>(labelText, "input");
}

function selectByLabel(labelText: string) {
  return controlByLabel<HTMLSelectElement>(labelText, "select");
}

function controlByLabel<T extends HTMLInputElement | HTMLSelectElement>(
  labelText: string,
  selector: "input" | "select"
): T {
  const label = Array.from(container.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(labelText)
  );

  const control = label?.querySelector(selector);
  if (!control) {
    throw new Error(`Could not find ${selector} for label ${labelText}`);
  }

  return control as T;
}

async function changeInput(labelText: string, value: string) {
  const input = inputByLabel(labelText);
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function changeSelect(labelText: string, value: string) {
  const select = selectByLabel(labelText);
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set;

  await act(async () => {
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitForm() {
  const form = container.querySelector("form");
  if (!form) throw new Error("Could not find form");

  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}
