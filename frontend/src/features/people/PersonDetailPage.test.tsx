import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import type { AuthzCurrentActor } from "../../types/authz";
import { PeopleListPage } from "./PeopleListPage";
import { PersonDetailPage } from "./PersonDetailPage";
import type { Person } from "../../types/people";

const authorizationActor: AuthzCurrentActor = {
  actorKey: "test-admin",
  actorRecordId: "actor-test-admin",
  tenantId: "default",
  scope: "APPLICATION",
  roleCodes: ["APPLICATION_ADMIN"],
  permissions: ["*"],
};

const tenantAdministratorActor: AuthzCurrentActor = {
  actorKey: "tenant-admin",
  actorRecordId: "actor-tenant-admin",
  tenantId: "default",
  scope: "TENANT",
  personId: "tenant-admin-person",
  membershipId: "tenant-admin-membership",
  roleCodes: ["TENANT_ADMIN"],
  permissions: [
    "people.read",
    "people.update",
    "collaborators.create",
  ],
  intrinsicPermissions: ["people.self.read"],
  delegatedPermissions: [
    "people.read",
    "people.update",
    "collaborators.create",
  ],
};

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

    const pageHeading = container.querySelector("h1");
    const personHeading = container.querySelector("header h2");
    expect(pageHeading?.textContent?.trim()).toBe("Person");
    expect(pageHeading?.className).toContain("text-3xl");
    expect(personHeading?.textContent?.trim()).toBe("Maria Silva");
    expect(personHeading?.className).toContain("text-lg");

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

      throw new Error(`Unhandled request: ${url}`);
    });

    const router = renderPersonDetailRoute();
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

    await waitForText("Person updated successfully.");
    await waitForText("Mariana Silva");
    expect(router.state.location.pathname).toBe(`/people/${PERSON_ID}`);
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

      throw new Error(`Unhandled request: ${url}`);
    });

    const router = renderPersonDetailRoute();
    await waitForText("Maria Silva");

    await changeSelect("Status", "ref-person-status-inactive");
    await submitForm();

    await waitFor(() => fetchCalls.some((call) => call.method === "PUT"));

    const updateCall = fetchCalls.find((call) => call.method === "PUT");
    expect(updateCall?.body).toMatchObject({
      statusId: "ref-person-status-inactive",
    });

    await waitForText("Person updated successfully.");
    expect(router.state.location.pathname).toBe(`/people/${PERSON_ID}`);
  });

  it("keeps the Address tab open and refreshes remaining sections after save", async () => {
    const incompletePerson: Person = {
      ...existingPerson,
      street1: "",
      street2: "",
      state: "",
      cep: "",
      city: "",
      bankName: "",
      bankNumber: "",
      checkingAccount: "",
      pixKey: "",
      emergencyName: "",
      emergencyCellular: "",
      emergencyEmail: "",
      profileCompletionStatus: "INCOMPLETE",
      canCreateCollaborator: false,
      missingSections: ["Address", "Bank", "Emergency"],
    };

    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "GET") {
        return jsonResponse({ data: incompletePerson });
      }

      if (url === `/api/v1/people/${PERSON_ID}` && methodOf(init) === "PUT") {
        return jsonResponse({
          data: {
            ...incompletePerson,
            street1: "Rua Jasmin, 198",
            state: "Amapa",
            city: "Laranjal do Jari",
            cep: "68920000",
            country: "Brasil",
            missingSections: ["Bank", "Emergency"],
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    const router = renderPersonDetailRoute();
    await waitForText("Maria Silva");

    await clickButton("Address");
    await changeInput("Street 1", "Rua Jasmin, 198");
    await changeInput("State", "Amapa");
    await changeInput("City", "Laranjal do Jari");
    await changeInput("CEP", "68920");
    await submitForm();

    await waitForText("Person updated successfully.");

    expect(router.state.location.pathname).toBe(`/people/${PERSON_ID}`);
    expect(buttonByText("Address").getAttribute("aria-pressed")).toBe("true");
    expect(textNode("Missing: Address")).toBeUndefined();
    expect(textNode("Missing: Bank")).toBeDefined();
    expect(textNode("Missing: Emergency")).toBeDefined();
  });

  it("offers a Tenant Administrator a Create Collaborator action for an eligible Person", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }

      if (url === "/api/v1/collaborators/candidates") {
        return jsonResponse({ data: [existingPerson] });
      }

      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: [] });
      }

      if (url === `/api/v1/people/${PERSON_ID}/authentication`) {
        return jsonResponse({
          data: {
            enabled: true,
            accountActive: true,
            canRequestReactivation: false,
            login: existingPerson.email,
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute(tenantAdministratorActor);

    await waitForText("Create Collaborator");

    const createCollaboratorLink = Array.from(
      container.querySelectorAll("a"),
    ).find((node) => node.textContent?.trim() === "Create Collaborator");

    expect(createCollaboratorLink?.getAttribute("href")).toBe(
      `/collaborators/new?personId=${PERSON_ID}`,
    );
    expect(
      fetchCalls.some(
        (call) =>
          call.method === "GET" &&
          call.url === "/api/v1/collaborators/candidates",
      ),
    ).toBe(true);
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

function renderPersonDetailRoute(
  actor: AuthzCurrentActor = authorizationActor,
) {
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
        <AuthorizationProvider value={actor}>
          <RouterProvider router={router} />
        </AuthorizationProvider>
      </QueryClientProvider>
    );
  });

  return router;
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

function buttonByText(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim().startsWith(text)
  );

  if (!button) {
    throw new Error(`Could not find button ${text}`);
  }

  return button;
}

async function clickButton(text: string) {
  const button = buttonByText(text);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function submitForm() {
  const form = container.querySelector("form");
  if (!form) throw new Error("Could not find form");

  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}
