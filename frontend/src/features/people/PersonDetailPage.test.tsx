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
import type { Collaborator } from "../../types/collaborators";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../i18n";

const authorizationActor: AuthzCurrentActor = {
  actorKey: "people-operator",
  actorRecordId: "actor-people-operator",
  tenantId: "default",
  scope: "TENANT",
  roleCodes: ["EXPENSE_OPERATOR"],
  permissions: ["people.read"],
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

const tenantAdministratorWithCollaboratorRead: AuthzCurrentActor = {
  ...tenantAdministratorActor,
  permissions: [...tenantAdministratorActor.permissions, "collaborators.read"],
  delegatedPermissions: [
    ...(tenantAdministratorActor.delegatedPermissions ?? []),
    "collaborators.read",
  ],
};

const PERSON_ID = "person-123";

const existingPerson: Person = {
  id: PERSON_ID,
  globalPersonId: "global-person-123",
  membershipId: "membership-default-person-123",
  tenantId: "default",
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

const currentCollaborator: Collaborator = {
  id: "collaborator-current-123",
  tenantId: "default",
  membershipId: existingPerson.membershipId ?? "membership-default-person-123",
  personId: existingPerson.globalPersonId ?? existingPerson.id,
  personName: "Maria Silva",
  personNickname: "Mari",
  journeyStartDate: "2026-09-01",
  defaultEndDate: "2026-09-30",
  extensionDays: 0,
  projectedEndDate: "2026-09-30",
  paymentMethodId: "ref-method-daily",
  paymentValue: 350,
  planningAvailability: "ACTIVE",
  sectorId: "ref-sector-1",
  locationId: "ref-location-1",
  taskId: "ref-task-1",
  statusId: "ref-collaborator-status-active",
  statusCode: "ACTIVE",
  statusLabel: "Active",
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
};

const personSelfServiceActor: AuthzCurrentActor = {
  actorKey: "person-self-service",
  actorRecordId: "actor-person-self-service",
  tenantId: "default",
  scope: "TENANT",
  personId: PERSON_ID,
  globalPersonId: "global-person-123",
  membershipId: "membership-default-person-123",
  collaboratorId: currentCollaborator.id,
  roleCodes: [],
  permissions: [
    "people.self.read",
    "people.self.update",
    "collaborators.self.read",
    "reference_data.read",
  ],
  intrinsicPermissions: [
    "people.self.read",
    "people.self.update",
    "collaborators.self.read",
    "reference_data.read",
  ],
  delegatedPermissions: [],
};

const closedCollaborator: Collaborator = {
  ...currentCollaborator,
  id: "collaborator-closed-123",
  journeyStartDate: "2026-01-10",
  defaultEndDate: "2026-04-10",
  projectedEndDate: "2026-04-10",
  paymentMethodLabel: "Daily Wage",
  taskLabel: "Miner",
  sectorLabel: "Mining",
  locationLabel: "Main Mine",
  statusId: "ref-collaborator-status-finished",
  statusCode: "FINISHED",
  statusLabel: "Finished",
  closedAt: "2026-04-15T12:00:00Z",
  createdAt: "2026-01-10T00:00:00Z",
  updatedAt: "2026-04-15T12:00:00Z",
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
  window.localStorage.clear();
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  document.body.removeChild(container);
  window.localStorage.clear();
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
    expect(container.textContent).toContain(
      "Membership ID: membership-default-person-123",
    );

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

  it("links an existing Collaborator Person to the current Journey without claiming eligibility", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }

      if (url === "/api/v1/collaborators/candidates") {
        return jsonResponse({ data: [] });
      }

      if (url === `/api/v1/collaborators/by-membership/${existingPerson.membershipId}`) {
        return jsonResponse({ data: [currentCollaborator] });
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

    renderPersonDetailRoute(tenantAdministratorWithCollaboratorRead);

    await waitForText("Open current Journey");

    const currentJourneyLink = Array.from(container.querySelectorAll("a")).find(
      (node) => node.textContent?.trim() === "Open current Journey",
    );
    expect(currentJourneyLink?.getAttribute("href")).toBe(
      `/collaborators/${currentCollaborator.id}`,
    );
    expect(container.textContent).toContain("All required profile sections are complete.");
    expect(container.textContent).not.toContain("eligible to become a Collaborator");
    expect(container.textContent).not.toContain("Create Collaborator");
  });

  it("shows a Tenant Administrator the current and closed Journeys for this Person only", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/candidates") {
        return jsonResponse({ data: [] });
      }
      if (url === `/api/v1/collaborators/by-membership/${existingPerson.membershipId}`) {
        return jsonResponse({ data: [closedCollaborator, currentCollaborator] });
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

    renderPersonDetailRoute(tenantAdministratorWithCollaboratorRead);

    await waitForText("Journey History");
    await waitForText("Current");
    await waitForText("Closed");
    await waitForText("Daily Wage");

    const journeyLinks = Array.from(container.querySelectorAll("a")).filter(
      (node) => node.textContent?.trim() === "Open Journey",
    );
    expect(journeyLinks.map((node) => node.getAttribute("href"))).toEqual([
      `/collaborators/${currentCollaborator.id}`,
      `/collaborators/${closedCollaborator.id}`,
    ]);
    expect(
      fetchCalls.some(
        (call) =>
          call.url ===
          `/api/v1/collaborators/by-membership/${existingPerson.membershipId}`,
      ),
    ).toBe(true);
  });

  it("renders Tenant Administrator Journey history in Brazilian Portuguese", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");

    mockFetch(async (url) => {
      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/candidates") {
        return jsonResponse({ data: [] });
      }
      if (url === `/api/v1/collaborators/by-membership/${existingPerson.membershipId}`) {
        return jsonResponse({ data: [closedCollaborator, currentCollaborator] });
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

    renderPersonDetailRoute(tenantAdministratorWithCollaboratorRead);

    await waitForText("Histórico de Jornadas");
    await waitForText("Atual");
    await waitForText("Encerrada");
    await waitForText("Abrir Jornada");
    expect(container.textContent).toContain(
      "Jornadas atuais e encerradas desta Pessoa na Entidade atual.",
    );
  });

  it("shows a Person their own current and closed Journeys from the self-service endpoint", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/self") {
        return jsonResponse({ data: [closedCollaborator, currentCollaborator] });
      }
      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute(personSelfServiceActor);

    await waitForText("Journey History");
    await waitForText("Your current and closed Collaborator Journeys in this Tenant.");
    await waitForText("Current");
    await waitForText("Closed");

    const journeyLinks = Array.from(container.querySelectorAll("a")).filter(
      (node) => node.textContent?.trim() === "Open Journey",
    );
    expect(journeyLinks.map((node) => node.getAttribute("href"))).toEqual([
      `/collaborators/${currentCollaborator.id}`,
      `/collaborators/${closedCollaborator.id}`,
    ]);
    expect(
      fetchCalls.some((call) => call.url === "/api/v1/collaborators/self"),
    ).toBe(true);
    expect(
      fetchCalls.some((call) =>
        call.url.includes("/api/v1/collaborators/by-membership/"),
      ),
    ).toBe(false);
  });

  it("lets a Person upload their own photo from their profile", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/self") {
        return jsonResponse({ data: [currentCollaborator] });
      }
      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute(personSelfServiceActor);

    await waitForText("Journey History");
    const photoSection = container.querySelector("#person-photo-title")?.closest("section");
    const fileInput = photoSection?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeTruthy();
    expect(fileInput?.disabled).toBe(false);
  });

  it("does not offer photo management when only globalPersonId matches the page", async () => {
    const globalOnlyActor: AuthzCurrentActor = {
      ...personSelfServiceActor,
      personId: "person-other-123",
      globalPersonId: PERSON_ID,
    };

    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/self") {
        return jsonResponse({ data: [currentCollaborator] });
      }
      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute(globalOnlyActor);

    await waitForText("Journey History");
    const photoSection = container.querySelector("#person-photo-title")?.closest("section");
    const fileInput = photoSection?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(!fileInput || fileInput.disabled).toBe(true);
  });

  it("does not offer photo management when self-update is only role-delegated", async () => {
    const delegatedOnlyActor: AuthzCurrentActor = {
      ...personSelfServiceActor,
      intrinsicPermissions: [],
      delegatedPermissions: ["people.self.update"],
    };

    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/self") {
        return jsonResponse({ data: [currentCollaborator] });
      }
      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute(delegatedOnlyActor);

    await waitForText("Journey History");
    const photoSection = container.querySelector("#person-photo-title")?.closest("section");
    const fileInput = photoSection?.querySelector<HTMLInputElement>('input[type="file"]');
    expect(!fileInput || fileInput.disabled).toBe(true);
  });

  it("keeps self-service Journey history visible when the Person has only closed Journeys", async () => {
    const closedOnlyActor: AuthzCurrentActor = {
      ...personSelfServiceActor,
      collaboratorId: undefined,
    };

    mockFetch(async (url) => {
      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/self") {
        return jsonResponse({ data: [closedCollaborator] });
      }
      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute(closedOnlyActor);

    await waitForText("Journey History");
    await waitForText("Closed");
    expect(container.textContent).toContain(closedCollaborator.id);
    expect(container.textContent).not.toContain("Current");
  });

  it("renders Person self-service Journey history in Brazilian Portuguese", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");

    mockFetch(async (url) => {
      if (url === `/api/v1/people/${PERSON_ID}`) {
        return jsonResponse({ data: existingPerson });
      }
      if (url === "/api/v1/collaborators/self") {
        return jsonResponse({ data: [closedCollaborator, currentCollaborator] });
      }
      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: [] });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPersonDetailRoute(personSelfServiceActor);

    await waitForText("Histórico de Jornadas");
    await waitForText("Suas Jornadas de Colaborador atuais e encerradas nesta Entidade.");
    await waitForText("Atual");
    await waitForText("Encerrada");
    await waitForText("Abrir Jornada");
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

describe("Person self-service photo flow", () => {
  const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  type PhotoState = { hasPhoto: boolean };

  beforeEach(() => {
    const urlStatics = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown };
    if (!urlStatics.createObjectURL) urlStatics.createObjectURL = vi.fn(() => "blob:person-photo");
    if (!urlStatics.revokeObjectURL) urlStatics.revokeObjectURL = vi.fn();
  });

  function mockSelfPhotoFetch(state: PhotoState) {
    const calls: Array<{ url: string; method: string; contentType: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = methodOf(init);
      const contentType = new Headers(init?.headers).get("Content-Type") ?? "";
      if (url === `/api/v1/people/${PERSON_ID}/photo`) {
        calls.push({ url, method, contentType });
        if (method === "GET") {
          if (!state.hasPhoto) return jsonResponse({ error: { code: "not_found", message: "Record not found" } }, { status: 404 });
          return new Response(new Blob([PNG_BYTES], { type: "image/png" }), { status: 200, headers: { "Content-Type": "image/png" } });
        }
        if (method === "PUT") {
          state.hasPhoto = true;
          return jsonResponse({ data: { contentType: contentType || "image/png", byteSize: PNG_BYTES.length, width: 100, height: 100, updatedAt: "2026-11-20T00:00:00Z" } });
        }
        if (method === "DELETE") {
          state.hasPhoto = false;
          return new Response(null, { status: 204 });
        }
      }
      if (url === `/api/v1/people/${PERSON_ID}`) return jsonResponse({ data: existingPerson });
      if (url === "/api/v1/collaborators/self") return jsonResponse({ data: [currentCollaborator] });
      if (url === "/api/v1/reference-data/person_status") return jsonResponse({ data: [] });
      throw new Error(`Unhandled request: ${method} ${url}`);
    });
    return calls;
  }

  function photoInput(): HTMLInputElement | null | undefined {
    const section = container.querySelector("#person-photo-title")?.closest("section");
    return section?.querySelector<HTMLInputElement>('input[type="file"]');
  }

  async function chooseFile(file: File) {
    const input = photoInput();
    expect(input).toBeTruthy();
    Object.defineProperty(input!, "files", { value: [file], configurable: true });
    await act(async () => input!.dispatchEvent(new Event("change", { bubbles: true })));
  }

  async function clickButton(text: string) {
    await waitFor(() => Boolean(buttonByText(text)));
    await act(async () => buttonByText(text)!.click());
  }

  it("collaborator uploads a valid photo to their own Person record", async () => {
    const state: PhotoState = { hasPhoto: false };
    const calls = mockSelfPhotoFetch(state);
    renderPersonDetailRoute(personSelfServiceActor);
    await waitForText("Journey History");
    await waitFor(() => Boolean(textNode("Add Photo")));

    await chooseFile(new File([PNG_BYTES], "me.png", { type: "image/png" }));
    await waitFor(() => calls.some((call) => call.method === "PUT"));

    const put = calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(`/api/v1/people/${PERSON_ID}/photo`);
    expect(put?.contentType).toBe("image/png");
    expect(state.hasPhoto).toBe(true);
  });

  it("collaborator replaces an existing photo with a JPEG", async () => {
    const state: PhotoState = { hasPhoto: true };
    const calls = mockSelfPhotoFetch(state);
    renderPersonDetailRoute(personSelfServiceActor);
    await waitForText("Journey History");
    await waitFor(() => Boolean(textNode("Replace Photo")));

    await chooseFile(new File([PNG_BYTES], "new.jpg", { type: "image/jpeg" }));
    await waitFor(() => calls.some((call) => call.method === "PUT"));

    const put = calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(`/api/v1/people/${PERSON_ID}/photo`);
    expect(put?.contentType).toBe("image/jpeg");
  });

  it("collaborator removes their own photo and the placeholder returns", async () => {
    const state: PhotoState = { hasPhoto: true };
    const calls = mockSelfPhotoFetch(state);
    renderPersonDetailRoute(personSelfServiceActor);
    await waitForText("Journey History");
    await clickButton("Remove Photo");
    await waitFor(() => calls.some((call) => call.method === "DELETE"));

    expect(calls.some((call) => call.method === "DELETE" && call.url === `/api/v1/people/${PERSON_ID}/photo`)).toBe(true);
    expect(state.hasPhoto).toBe(false);
  });

  it("re-uploads the same file after removal", async () => {
    const state: PhotoState = { hasPhoto: true };
    const calls = mockSelfPhotoFetch(state);
    renderPersonDetailRoute(personSelfServiceActor);
    await waitForText("Journey History");
    await clickButton("Remove Photo");
    await waitFor(() => calls.some((call) => call.method === "DELETE"));

    const file = new File([PNG_BYTES], "same.png", { type: "image/png" });
    await waitFor(() => Boolean(textNode("Add Photo")));
    await chooseFile(file);
    await waitFor(() => calls.filter((call) => call.method === "PUT").length === 1);
    expect(state.hasPhoto).toBe(true);
  });

  it("rejects a PDF renamed as JPEG without sending it and keeps the existing photo", async () => {
    const state: PhotoState = { hasPhoto: true };
    const calls = mockSelfPhotoFetch(state);
    renderPersonDetailRoute(personSelfServiceActor);
    await waitForText("Journey History");
    await waitFor(() => Boolean(textNode("Replace Photo")));

    await chooseFile(new File([new Uint8Array([37, 80, 68, 70])], "fake.jpg", { type: "application/pdf" }));
    await waitForText("Choose a JPEG or PNG image.");

    expect(calls.some((call) => call.method === "PUT")).toBe(false);
    expect(state.hasPhoto).toBe(true);
  });

  it("rejects an oversized photo without sending it and keeps the existing photo", async () => {
    const state: PhotoState = { hasPhoto: true };
    const calls = mockSelfPhotoFetch(state);
    renderPersonDetailRoute(personSelfServiceActor);
    await waitForText("Journey History");
    await waitFor(() => Boolean(textNode("Replace Photo")));

    await chooseFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", { type: "image/png" }));
    await waitForText("The photo must be no larger than 5 MiB.");

    expect(calls.some((call) => call.method === "PUT")).toBe(false);
    expect(state.hasPhoto).toBe(true);
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
      <I18nProvider><QueryClientProvider client={queryClient}>
        <AuthorizationProvider value={actor}>
          <RouterProvider router={router} />
        </AuthorizationProvider>
      </QueryClientProvider></I18nProvider>
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
      if (url === `/api/v1/people/${PERSON_ID}/photo` && methodOf(init) === "GET") {
        return jsonResponse({ error: { code: "not_found", message: "Record not found" } }, { status: 404 });
      }
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

