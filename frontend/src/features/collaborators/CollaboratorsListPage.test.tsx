import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import type { AuthzCurrentActor } from "../../types/authz";
import type { Collaborator } from "../../types/collaborators";
import { CollaboratorsListPage } from "./CollaboratorsListPage";


const adminActor: AuthzCurrentActor = {
  actorKey: "test-admin",
  actorRecordId: "actor-test-admin",
  tenantId: "default",
  scope: "TENANT",
  roleCodes: ["TENANT_ADMIN"],
  permissions: ["collaborators.read"],
};

const selfActor: AuthzCurrentActor = {
  actorKey: "identity-a",
  actorRecordId: "actor-identity-a",
  tenantId: "default",
  scope: "TENANT",
  personId: "person-identity-a",
  globalPersonId: "global-person-identity-a",
  membershipId: "membership-identity-a",
  collaboratorId: "collab-open",
  roleCodes: [],
  permissions: ["people.self.read", "collaborators.self.read"],
  intrinsicPermissions: ["people.self.read", "collaborators.self.read"],
};

const collaborators: Collaborator[] = [
  {
    id: "collab-1",
    tenantId: "default",
    membershipId: "membership-1",
    personId: "global-person-1",
    legacyPersonId: "person-1",
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
    id: "collab-filtered-zulu",
    membershipId: "membership-filtered-zulu",
    personId: "global-person-filtered-zulu",
    legacyPersonId: "person-filtered-zulu",
    personName: "Zuleica Filger",
    personNickname: "Zulu",
  },
  {
    ...collaborators[0],
    id: "collab-filtered-ana",
    membershipId: "membership-filtered-ana",
    personId: "global-person-filtered-ana",
    legacyPersonId: "person-filtered-ana",
    personName: "Ana Filger",
    personNickname: "Ana",
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
      if (url === "/api/v1/collaborators?page=1&pageSize=100") {
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

  it("uses server-side name search and sorts the returned results", async () => {
    const urls: string[] = [];
    mockFetch(async (url) => {
      urls.push(url);
      if (
        url ===
        "/api/v1/collaborators?search=Filger&page=1&pageSize=25"
      ) {
        return jsonResponse({
          data: { items: filteredCollaborators, total: 2 },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage("/collaborators?search=Filger");

    await waitForText("Ana Filger");
    expect(urls).toEqual([
      "/api/v1/collaborators?search=Filger&page=1&pageSize=25",
    ]);
    expect(textNode("Filtering by “Filger”.")).toBeTruthy();
    expect(
      container.querySelector<HTMLInputElement>("#collaborator-search")?.value,
    ).toBe("Filger");

    const displayedNames = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("tbody a"),
    ).map((link) => link.textContent?.trim());
    expect(displayedNames).toEqual(["Ana", "Zulu"]);
  });

  it("shows a filtered empty state", async () => {
    mockFetch(async (url) => {
      if (
        url ===
        "/api/v1/collaborators?search=Missing&page=1&pageSize=25"
      ) {
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
      if (url === "/api/v1/collaborators?page=1&pageSize=100") {
        return jsonResponse({ data: { items: [], total: 0 } });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage();

    await waitForText("No collaborators yet");
    expect(
      textNode(
        "Create a Collaborator after the related Person profile is complete.",
      ),
    ).toBeTruthy();
  });

  it("shows the signed-in Person's current and closed Journey history", async () => {
    const closedJourney: Collaborator = {
      ...collaborators[0],
      id: "collab-closed",
      membershipId: "membership-identity-a",
      personId: "global-person-identity-a",
      legacyPersonId: "person-identity-a",
      personName: "Identity A",
      personNickname: "Identity A",
      journeyStartDate: "2026-01-01",
      closedAt: "2026-03-31T17:00:00Z",
      statusId: "ref-collaborator-finished",
      statusLabel: "Finished",
    };
    const openJourney: Collaborator = {
      ...closedJourney,
      id: "collab-open",
      journeyStartDate: "2026-04-15",
      closedAt: undefined,
      statusId: "ref-collaborator-active",
      statusLabel: "Active",
    };

    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators/self") {
        return jsonResponse({ data: [closedJourney, openJourney] });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage("/collaborators", selfActor);

    await waitForText("Showing 2 Journeys.");
    expect(textNode("My Collaborator Journeys")).toBeTruthy();
    expect(textNode("Journey History")).toBeTruthy();
    expect(container.textContent).toContain("Closed 2026-03-31T17:00:00Z");
    expect(container.textContent).toContain("Closed");
    expect(container.textContent).toContain("Active");
    expect(linkByHref("/collaborators/collab-closed")).toBeTruthy();
    expect(linkByHref("/collaborators/collab-open")).toBeTruthy();
    expect(textNode("Add")).toBeFalsy();
  });

  it("shows backend errors", async () => {
    mockFetch(async (url) => {
      if (url === "/api/v1/collaborators?page=1&pageSize=100") {
        return jsonResponse(
          {
            error: {
              code: "internal_error",
              message: "Could not list collaborators",
            },
          },
          { status: 500 },
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderCollaboratorsListPage();

    await waitForText("Could not list collaborators");
    expect(textNode("Status: 500 · Code: internal_error")).toBeTruthy();
  });
});

function renderCollaboratorsListPage(
  initialEntry = "/collaborators",
  actor: AuthzCurrentActor = adminActor,
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/collaborators", element: <CollaboratorsListPage /> }],
    { initialEntries: [initialEntry] },
  );

  root = createRoot(container);

  act(() => {
    root?.render(
      <AuthorizationProvider value={actor}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </AuthorizationProvider>,
    );
  });
}

function linkByHref(href: string) {
  return container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
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
