import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthzActor } from "../../types/authz";
import { AuthzAdminPage } from "./AuthzAdminPage";

const roles = [
  {
    id: "authz-role-application-admin",
    code: "APPLICATION_ADMIN",
    label: "Application Admin",
    description: "Global admin",
    scopeType: "global",
    active: true,
    permissions: [{ code: "*", label: "All", description: "All permissions" }],
  },
  {
    id: "authz-role-person",
    code: "PERSON",
    label: "Person",
    description: "Deprecated intrinsic self-service role",
    scopeType: "SELF",
    active: false,
    permissions: [{ code: "people.self.read", label: "Read self", description: "" }],
  },
  {
    id: "authz-role-expense-operator",
    code: "EXPENSE_OPERATOR",
    label: "Expense Operator",
    description: "Expense operations",
    scopeType: "tenant",
    active: true,
    permissions: [{ code: "expenses.create", label: "Create Expenses", description: "" }],
  },
  {
    id: "authz-role-tenant-admin",
    code: "TENANT_ADMIN",
    label: "Tenant Administrator",
    description: "Tenant administration",
    scopeType: "TENANT",
    active: true,
    permissions: [],
  },
];

const permissions = [
  { code: "authz.read", label: "Read Authorization", description: "Read authz data" },
  { code: "authz.manage", label: "Manage Authorization", description: "Manage authz data" },
];

function activeTenantBinding(tenantId: string) {
  return {
    accountId: `account-${tenantId}`,
    accountLogin: `account-${tenantId}@example.test`,
    scopeType: "TENANT",
    tenantId,
    membershipId: `membership-${tenantId}`,
    membershipTenantId: tenantId,
    membershipActive: true,
    membershipSameTenant: true,
  };
}

const collaborators = [
  {
    id: "collaborator-expense-admin",
    tenantId: "default",
    personId: "person-expense-admin",
    personName: "Expense Admin",
    personNickname: "Expense Admin",
    journeyStartDate: "2026-01-01",
    defaultEndDate: "2026-04-01",
    extensionDays: 0,
    projectedEndDate: "2026-04-01",
    paymentMethodId: "payment-method-fixed",
    paymentMethodLabel: "Fixed",
    paymentValue: 0,
    planningAvailability: "ACTIVE",
    sectorId: "sector-operations",
    sectorLabel: "Operations",
    locationId: "location-main",
    locationLabel: "Main Mine",
    taskId: "task-expenses",
    taskLabel: "Expenses",
    statusId: "status-active",
    statusLabel: "Active",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "collaborator-aurea",
    tenantId: "default",
    personId: "person-aurea",
    personName: "Aurea de Souza",
    personNickname: "Áurea",
    journeyStartDate: "2026-01-02",
    defaultEndDate: "2026-04-02",
    extensionDays: 0,
    projectedEndDate: "2026-04-02",
    paymentMethodId: "payment-method-fixed",
    paymentMethodLabel: "Fixed",
    paymentValue: 0,
    planningAvailability: "ACTIVE",
    sectorId: "sector-operations",
    sectorLabel: "Operations",
    locationId: "location-main",
    locationLabel: "Main Mine",
    taskId: "task-expenses",
    taskLabel: "Expenses",
    statusId: "status-active",
    statusLabel: "Active",
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

let actors: AuthzActor[] = [
  {
    id: "actor-bootstrap-admin",
    actorKey: "bootstrap-admin",
    displayName: "Bootstrap Admin",
    active: true,
    roleGrants: [
      {
        id: "grant-bootstrap-admin",
        actorId: "actor-bootstrap-admin",
        roleId: "authz-role-application-admin",
        roleCode: "APPLICATION_ADMIN",
        tenantId: "*",
        scopeType: "global",
        active: true,
      },
    ],
  },
];

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
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
  actors = [
    {
      id: "actor-bootstrap-admin",
      actorKey: "bootstrap-admin",
      displayName: "Bootstrap Admin",
      active: true,
      roleGrants: [
        {
          id: "grant-bootstrap-admin",
          actorId: "actor-bootstrap-admin",
          roleId: "authz-role-application-admin",
          roleCode: "APPLICATION_ADMIN",
          tenantId: "*",
          scopeType: "global",
          active: true,
        },
      ],
    },
  ];
  resetAuthzAdminLocalStorage();
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

describe("AuthzAdminPage", () => {
  it("lists roles, permissions, and actors using the authenticated session context", async () => {
    mockAuthzFetch();

    renderAuthzAdminPage();

    await waitForText("APPLICATION_ADMIN");
    await waitForText("authz.manage");
    await waitForText("Bootstrap Admin");
    await waitForText("Authenticated actor verified");

    expect(fetchCalls.some((call) => call.url === "/api/v1/authz/current-actor")).toBe(true);
    expect(fetchCalls.some((call) => call.url === "/api/v1/authz/roles")).toBe(true);
    expect(textNode("PERSON")).toBeDefined();
    const personGrantOption = Array.from(document.querySelectorAll("select option")).find(
      (option) => option.textContent === "PERSON",
    );
    expect(personGrantOption).toBeUndefined();
    expect(fetchCalls.some((call) => call.url === "/api/v1/authz/permissions")).toBe(true);
    expect(fetchCalls.some((call) => call.url === "/api/v1/authz/actors")).toBe(true);
    expect(
      fetchCalls.some(
        (call) => call.url === "/api/v1/collaborators?page=1&pageSize=100",
      ),
    ).toBe(false);
    expect(fetchCalls.every((call) => call.headers["X-Actor-ID"] === undefined)).toBe(true);
    expect(fetchCalls.every((call) => call.headers["X-Tenant-ID"] === "default")).toBe(true);
  });

  it("filters actor cards progressively by the linked Person nickname", async () => {
    actors.push({
      id: "actor-aurea",
      actorKey: "collaborator-aurea",
      displayName: "Historical Actor Label",
      personId: "person-aurea",
      collaboratorId: "collaborator-aurea",
      active: true,
      roleGrants: [],
    });
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Historical Actor Label");

    const filter = controlByLabel<HTMLInputElement>(
      container,
      "Filter actors by person nickname",
      "input",
    );
    await setInputValue(filter, "aure");

    await waitFor(() => actorCardKeys().length === 1);
    expect(actorCardKeys()).toEqual(["collaborator-aurea"]);
    expect(container.textContent).toContain("Showing 1 of 2 actor records");

    await setInputValue(filter, "nickname-that-does-not-exist");
    await waitForText("No actors match these filters.");
    expect(actorCardKeys()).toEqual([]);

    await clickButtonByName("Clear");
    await waitFor(() => actorCardKeys().length === 2);
    expect(actorCardKeys()).toEqual(["bootstrap-admin", "collaborator-aurea"]);
  });

  it("shows and filters tenant Role Grant eligibility from Account and Membership facts", async () => {
    const tenantId = "tenant-a";
    actors.push(
      {
        id: "actor-eligible",
        actorKey: "eligible-actor",
        displayName: "Eligible Actor",
        active: true,
        roleGrants: [],
        binding: activeTenantBinding(tenantId),
      },
      {
        id: "actor-inactive-membership",
        actorKey: "inactive-membership-actor",
        displayName: "Inactive Membership Actor",
        active: true,
        roleGrants: [],
        binding: {
          ...activeTenantBinding(tenantId),
          accountId: "account-inactive-membership",
          accountLogin: "inactive-membership@example.test",
          membershipId: "membership-inactive",
          membershipActive: false,
        },
      },
      {
        id: "actor-mismatched-membership",
        actorKey: "mismatched-membership-actor",
        displayName: "Mismatched Membership Actor",
        active: true,
        roleGrants: [],
        binding: {
          ...activeTenantBinding(tenantId),
          accountId: "account-mismatched-membership",
          accountLogin: "mismatched-membership@example.test",
          membershipId: "membership-mismatched",
          membershipTenantId: "tenant-b",
          membershipSameTenant: false,
        },
      },
    );
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Eligible Actor");

    const eligibleArticle = articleByText("eligible-actor");
    expect(eligibleArticle.textContent).toContain(
      "Authentication Account: Bound · account-tenant-a@example.test",
    );
    expect(eligibleArticle.textContent).toContain(
      "Authentication binding: TENANT · tenant-a",
    );
    expect(eligibleArticle.textContent).toContain(
      "Person–Tenant Membership: ACTIVE · same tenant · membership-tenant-a",
    );
    expect(eligibleArticle.textContent).toContain(
      "Tenant Role Grants: ELIGIBLE",
    );

    const inactiveArticle = articleByText("inactive-membership-actor");
    expect(inactiveArticle.textContent).toContain(
      "Person–Tenant Membership: INACTIVE · same tenant · membership-inactive",
    );
    expect(inactiveArticle.textContent).toContain(
      "Tenant Role Grants: INELIGIBLE",
    );
    expect(inactiveArticle.textContent).toContain(
      "Person–Tenant Membership must be ACTIVE.",
    );

    const mismatchedArticle = articleByText("mismatched-membership-actor");
    expect(mismatchedArticle.textContent).toContain(
      "Person–Tenant Membership: ACTIVE · tenant mismatch (tenant-b) · membership-mismatched",
    );
    expect(mismatchedArticle.textContent).toContain(
      "Tenant Role Grants: INELIGIBLE",
    );
    expect(mismatchedArticle.textContent).toContain(
      "Membership must belong to the Actor's bound tenant.",
    );

    const eligibilityFilter = controlByLabel<HTMLSelectElement>(
      container,
      "Tenant Role Grant eligibility",
      "select",
    );
    await setSelectValue(eligibilityFilter, "ELIGIBLE");

    await waitFor(() => actorCardKeys().length === 1);
    expect(actorCardKeys()).toEqual(["eligible-actor"]);
    expect(container.textContent).toContain(
      "Showing 1 of 4 actor records · 1 eligible for tenant Role Grants.",
    );

    await setSelectValue(eligibilityFilter, "INELIGIBLE");
    await waitFor(() => actorCardKeys().length === 3);
    expect(actorCardKeys()).toEqual([
      "bootstrap-admin",
      "inactive-membership-actor",
      "mismatched-membership-actor",
    ]);

    await clickButtonByName("Clear");
    await waitFor(() => actorCardKeys().length === 4);
    expect(eligibilityFilter.value).toBe("ALL");
  });

  it("filters collaborators progressively and creates an actor from the selected match", async () => {
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Bootstrap Admin");

    const collaboratorSearch = controlByLabel<HTMLInputElement>(
      formByHeading("Create actor"),
      "Find collaborator by person nickname",
      "input",
    );
    await setInputValue(collaboratorSearch, "pense");

    await waitForText("Expense Admin · Active · Main Mine");
    expect(
      fetchCalls.some(
        (call) =>
          call.url ===
          "/api/v1/collaborators?search=pense&page=1&pageSize=25",
      ),
    ).toBe(true);
    expect(createActorSuggestionLabels()).toEqual([
      "Expense Admin · Active · Main Mine",
    ]);

    await clickCreateActorSuggestion("Expense Admin · Active · Main Mine");
    await waitForText("Actor key: collaborator-expense-admin");
    expect(collaboratorSearch.value).toBe("");
    expect(createActorSuggestionLabels()).toEqual([]);

    await submitFormByHeading("Create actor");

    await waitForText("collaborator-expense-admin created.");

    const createCall = fetchCalls.find(
      (call) => call.url === "/api/v1/authz/actors" && call.method === "POST",
    );
    expect(createCall?.body).toMatchObject({
      actorKey: "collaborator-expense-admin",
      displayName: "Expense Admin",
      active: true,
      personId: "person-expense-admin",
      collaboratorId: "collaborator-expense-admin",
    });
  });

  it("matches Create actor collaborators by any accent-insensitive nickname substring", async () => {
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Bootstrap Admin");

    const collaboratorSearch = controlByLabel<HTMLInputElement>(
      formByHeading("Create actor"),
      "Find collaborator by person nickname",
      "input",
    );
    await setInputValue(collaboratorSearch, "aure");

    await waitForText("Áurea · Active · Main Mine");
    expect(createActorSuggestionLabels()).toEqual([
      "Áurea · Active · Main Mine",
    ]);

    await setInputValue(collaboratorSearch, "nickname-that-does-not-exist");
    await waitForText("No matching collaborators");
    expect(createActorSuggestionLabels()).toEqual([]);
  });

  it("grants and revokes actor roles", async () => {
    actors.push({
      id: "actor-expense-admin",
      actorKey: "expense-admin",
      displayName: "Expense Admin",
      active: true,
      roleGrants: [],
      binding: activeTenantBinding("default"),
    });
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Expense Admin");

    await changeSelectInArticle("expense-admin", "Role", "EXPENSE_OPERATOR");
    const grantTenantInput = controlByLabel<HTMLInputElement>(
      articleByText("expense-admin"),
      "Grant tenant",
      "input",
    );
    expect(grantTenantInput.value).toBe("default");
    expect(grantTenantInput.disabled).toBe(true);
    await clickButtonInArticle("expense-admin", "Grant Role");

    await waitForText("EXPENSE_OPERATOR granted.");
    expect(
      fetchCalls.some(
        (call) =>
          call.url === "/api/v1/authz/actors/actor-expense-admin/role-grants" &&
          call.method === "POST" &&
          (call.body as { roleCode?: string }).roleCode === "EXPENSE_OPERATOR",
      ),
    ).toBe(true);

    await clickButtonInArticle("expense-admin", "Revoke");
    await waitForText("EXPENSE_OPERATOR revoked.");
    expect(
      fetchCalls.some(
        (call) =>
          call.url === "/api/v1/authz/actors/actor-expense-admin/role-grants/grant-expense-admin" &&
          call.method === "DELETE",
      ),
    ).toBe(true);
  });

  it("derives a tenant grant from the Actor binding instead of the application wildcard", async () => {
    const tenantId = "b16647b4-82a3-4d4e-99d0-c15ede05840b";
    window.localStorage.setItem("ers.auth.selectedTenantId", "*");
    actors.push({
      id: "actor-expense-admin",
      actorKey: "expense-admin",
      displayName: "Expense Admin",
      active: true,
      roleGrants: [],
      binding: activeTenantBinding(tenantId),
    });
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Expense Admin");

    await changeSelectInArticle("expense-admin", "Role", "TENANT_ADMIN");
    const article = articleByText("expense-admin");
    const grantTenantInput = controlByLabel<HTMLInputElement>(article, "Grant tenant", "input");
    const grantButton = buttonInArticle("expense-admin", "Grant Role");

    expect(grantTenantInput.value).toBe(tenantId);
    expect(grantTenantInput.disabled).toBe(true);
    expect(grantButton.disabled).toBe(false);
    expect(article.textContent).toContain(
      `Authentication Account: Bound · account-${tenantId}@example.test`,
    );
    expect(article.textContent).toContain(
      `Authentication binding: TENANT · ${tenantId}`,
    );
    expect(article.textContent).toContain(
      `Person–Tenant Membership: ACTIVE · same tenant · membership-${tenantId}`,
    );
    expect(article.textContent).toContain("Tenant Role Grants: ELIGIBLE");
    expect(
      Array.from(controlByLabel<HTMLSelectElement>(article, "Role", "select").options).some(
        (option) => option.value === "APPLICATION_ADMIN",
      ),
    ).toBe(false);

    await clickButtonInArticle("expense-admin", "Grant Role");
    await waitForText("TENANT_ADMIN granted.");

    expect(
      fetchCalls.some(
        (call) =>
          call.url === "/api/v1/authz/actors/actor-expense-admin/role-grants" &&
          call.method === "POST" &&
          (call.body as { roleCode?: string; tenantId?: string }).roleCode === "TENANT_ADMIN" &&
          (call.body as { roleCode?: string; tenantId?: string }).tenantId === tenantId,
      ),
    ).toBe(true);

    await waitFor(() => articleByText("expense-admin").textContent?.includes(tenantId) ?? false);
    expect(buttonInArticle("expense-admin", "Grant Role").disabled).toBe(true);
  });

  it("rehydrates a persisted tenant grant with its own tenant after the page mounts", async () => {
    const tenantId = "b16647b4-82a3-4d4e-99d0-c15ede05840b";
    window.localStorage.setItem("ers.auth.selectedTenantId", "default");
    actors.push({
      id: "actor-expense-admin",
      actorKey: "expense-admin",
      displayName: "Expense Admin",
      active: true,
      binding: activeTenantBinding(tenantId),
      roleGrants: [
        {
          id: "grant-expense-admin",
          actorId: "actor-expense-admin",
          roleId: "authz-role-tenant-admin",
          roleCode: "TENANT_ADMIN",
          tenantId,
          scopeType: "TENANT",
          active: true,
        },
      ],
    });
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Expense Admin");

    const article = articleByText("expense-admin");
    expect(
      controlByLabel<HTMLSelectElement>(article, "Role", "select").value,
    ).toBe("TENANT_ADMIN");
    expect(
      controlByLabel<HTMLInputElement>(article, "Grant tenant", "input").value,
    ).toBe(tenantId);
    const persistedGrantButton = buttonInArticle("expense-admin", "Grant Role");
    expect(persistedGrantButton.disabled).toBe(true);
    expect(persistedGrantButton.className).toContain("disabled:bg-gray-300");
    expect(persistedGrantButton.className).toContain("disabled:text-gray-600");
    expect(persistedGrantButton.className).toContain("disabled:cursor-not-allowed");
    expect(article.textContent).toContain(`TENANT_ADMIN · ${tenantId}`);
    expect(article.textContent).toContain(
      `TENANT_ADMIN is already granted for ${tenantId}.`,
    );
  });

  it("uses the Actor tenant binding for tenant grants and disables an existing grant", async () => {
    const tenantId = "b16647b4-82a3-4d4e-99d0-c15ede05840b";
    window.localStorage.setItem("ers.auth.selectedTenantId", "default");
    actors.push({
      id: "actor-expense-admin",
      actorKey: "expense-admin",
      displayName: "Expense Admin",
      active: true,
      roleGrants: [],
      binding: activeTenantBinding(tenantId),
    });
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Expense Admin");

    await changeSelectInArticle("expense-admin", "Role", "TENANT_ADMIN");
    const article = articleByText("expense-admin");
    const grantTenantInput = controlByLabel<HTMLInputElement>(article, "Grant tenant", "input");
    expect(grantTenantInput.value).toBe(tenantId);

    await clickButtonInArticle("expense-admin", "Grant Role");
    await waitForText("TENANT_ADMIN granted.");

    expect(
      fetchCalls.some(
        (call) =>
          call.url === "/api/v1/authz/actors/actor-expense-admin/role-grants" &&
          call.method === "POST" &&
          (call.body as { roleCode?: string; tenantId?: string }).roleCode === "TENANT_ADMIN" &&
          (call.body as { roleCode?: string; tenantId?: string }).tenantId === tenantId,
      ),
    ).toBe(true);

    await waitFor(() => articleByText("expense-admin").textContent?.includes(tenantId) ?? false);
    const refreshedArticle = articleByText("expense-admin");
    const refreshedRoleSelect = controlByLabel<HTMLSelectElement>(
      refreshedArticle,
      "Role",
      "select",
    );
    const refreshedGrantTenantInput = controlByLabel<HTMLInputElement>(
      refreshedArticle,
      "Grant tenant",
      "input",
    );
    const grantButton = buttonInArticle("expense-admin", "Grant Role");

    expect(refreshedRoleSelect.value).toBe("TENANT_ADMIN");
    expect(refreshedGrantTenantInput.value).toBe(tenantId);
    expect(grantButton.disabled).toBe(true);
    expect(grantButton.className).toContain("disabled:bg-gray-300");
    expect(grantButton.className).toContain("disabled:text-gray-600");
    expect(grantButton.className).toContain("disabled:cursor-not-allowed");
    expect(refreshedArticle.textContent).toContain(
      `TENANT_ADMIN is already granted for ${tenantId}.`,
    );
  });

  it("deactivates a non-operating persisted actor", async () => {
    actors.push({
      id: "actor-expense-admin",
      actorKey: "expense-admin",
      displayName: "Expense Admin",
      active: true,
      roleGrants: [],
    });
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Expense Admin");
    await clickButtonInArticle("expense-admin", "Deactivate");
    await waitForText("expense-admin deactivated.");

    expect(
      fetchCalls.some(
        (call) =>
          call.url === "/api/v1/authz/actors/actor-expense-admin/active" &&
          call.method === "PATCH" &&
          (call.body as { active?: boolean }).active === false,
      ),
    ).toBe(true);
  });

  it("changes the selected tenant without allowing actor impersonation", async () => {
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Authenticated actor verified");

    const tenantInput = controlByLabel<HTMLInputElement>(
      container,
      "Selected Tenant ID",
      "input",
    );
    await setInputValue(tenantInput, "tenant-b");

    await waitFor(() =>
      fetchCalls.some(
        (call) =>
          call.url === "/api/v1/authz/current-actor" &&
          call.headers["X-Tenant-ID"] === "tenant-b",
      ),
    );

    const currentActorCurl = container.querySelector(
      '[aria-label="Current actor curl command"]',
    );
    expect(currentActorCurl?.textContent).toContain("-b /tmp/ers-session.cookies");
    expect(currentActorCurl?.textContent).toContain('X-Tenant-ID: tenant-b');
    expect(currentActorCurl?.textContent).not.toContain("X-Actor-ID");
    expect(
      fetchCalls.every((call) => call.headers["X-Actor-ID"] === undefined),
    ).toBe(true);
  });

  it("shows limited-access guidance instead of raw forbidden query errors", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);
      const method = methodOf(init);

      if (url === "/api/v1/authz/current-actor" && method === "GET") {
        return jsonResponse({
          data: {
            actorKey: "expense-admin",
            actorRecordId: "actor-expense-admin",
            tenantId: "default",
            scope: "TENANT",
            roleCodes: ["EXPENSE_OPERATOR"],
            permissions: ["expenses.create"],
          },
        });
      }

      if (
        method === "GET" &&
        (url === "/api/v1/authz/roles" ||
          url === "/api/v1/authz/permissions" ||
          url === "/api/v1/authz/actors")
      ) {
        return forbiddenResponse();
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    renderAuthzAdminPage();

    await waitForText("Selected actor has limited authorization");
    await waitForText("Create actor unavailable for this actor");
    await waitForText("Actors unavailable for this actor");
    await waitForText("Roles unavailable for this actor");
    await waitForText("Permissions unavailable for this actor");

    expect(textNode("Actor is not permitted to perform this operation")).toBeUndefined();
    expect(textNode("URL: /api/v1/authz/roles")).toBeUndefined();
  });
});

function resetAuthzAdminLocalStorage() {
  const storage = window.localStorage as Storage & { clear?: () => void };

  if (typeof storage.removeItem === "function") {
    storage.removeItem("ers.auth.selectedTenantId");
    return;
  }

  if (typeof storage.setItem === "function") {
    storage.setItem("ers.auth.selectedTenantId", "");
  }
}

function mockAuthzFetch() {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);
    const method = methodOf(init);

    if (url === "/api/v1/authz/current-actor" && method === "GET") {
      const headers = headersOf(init);
      const requestedTenantId = headers["X-Tenant-ID"] || "default";
      const actor = actors[0];
      const roleCodes = (actor.roleGrants ?? [])
        .filter((grant) => grant.active)
        .map((grant) => grant.roleCode);

      return jsonResponse({
        data: {
          actorKey: actor.actorKey,
          actorRecordId: actor.id,
          tenantId: requestedTenantId,
          scope: roleCodes.includes("APPLICATION_ADMIN") ? "APPLICATION" : "TENANT",
          roleCodes,
          permissions: roleCodes.some(
            (roleCode) => roleCode === "APPLICATION_ADMIN" || roleCode === "TENANT_ADMIN",
          )
            ? ["*"]
            : [],
        },
      });
    }
    if (url === "/api/v1/authz/roles" && method === "GET") {
      return jsonResponse({ data: roles });
    }
    if (url === "/api/v1/authz/permissions" && method === "GET") {
      return jsonResponse({ data: permissions });
    }
    if (url === "/api/v1/authz/actors" && method === "GET") {
      return jsonResponse({ data: actors });
    }
    if (url.startsWith("/api/v1/collaborators?search=") && method === "GET") {
      const search = new URL(url, "http://localhost").searchParams.get("search") ?? "";
      const normalizedSearch = normalizeTestSearch(search);
      const matches = collaborators.filter((collaborator) =>
        normalizeTestSearch(collaborator.personNickname).includes(normalizedSearch),
      );
      return jsonResponse({ data: { items: matches, total: matches.length } });
    }
    if (url === "/api/v1/authz/actors" && method === "POST") {
      const body = parseBody(init?.body) as { actorKey: string; displayName: string; active: boolean };
      const created = {
        id: `actor-${body.actorKey}`,
        actorKey: body.actorKey,
        displayName: body.displayName,
        active: body.active,
        roleGrants: [],
      };
      actors = [...actors, created];
      return jsonResponse({ data: created }, { status: 201 });
    }
    if (url === "/api/v1/authz/actors/actor-expense-admin/active" && method === "PATCH") {
      const body = parseBody(init?.body) as { active: boolean };
      const updated = actors.find((actor) => actor.id === "actor-expense-admin");
      if (!updated) return jsonResponse({ error: { message: "Actor not found" } }, { status: 404 });
      actors = actors.map((actor) =>
        actor.id === "actor-expense-admin" ? { ...actor, active: body.active } : actor,
      );
      return jsonResponse({ data: { ...updated, active: body.active } });
    }
    if (url === "/api/v1/authz/actors/actor-expense-admin/role-grants" && method === "POST") {
      const body = parseBody(init?.body) as { roleCode: string; tenantId: string };
      const grant = {
        id: "grant-expense-admin",
        actorId: "actor-expense-admin",
        roleId: "authz-role-expense-operator",
        roleCode: body.roleCode,
        tenantId: body.tenantId,
        scopeType: "tenant",
        active: true,
      };
      actors = actors.map((actor) =>
        actor.id === "actor-expense-admin"
          ? { ...actor, roleGrants: [grant] }
          : actor,
      );
      return jsonResponse({ data: grant }, { status: 201 });
    }
    if (
      url === "/api/v1/authz/actors/actor-expense-admin/role-grants/grant-expense-admin" &&
      method === "DELETE"
    ) {
      const grant = actors.find((actor) => actor.id === "actor-expense-admin")?.roleGrants?.[0];
      actors = actors.map((actor) =>
        actor.id === "actor-expense-admin" ? { ...actor, roleGrants: [] } : actor,
      );
      return jsonResponse({ data: grant });
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

function renderAuthzAdminPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/admin/authorization", element: <AuthzAdminPage /> }],
    { initialEntries: ["/admin/authorization"] },
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

function recordFetchCall(url: string, init?: RequestInit) {
  fetchCalls.push({
    url,
    method: methodOf(init),
    headers: headersOf(init),
    body: parseBody(init?.body),
  });
}

function methodOf(init?: RequestInit) {
  return init?.method?.toUpperCase() ?? "GET";
}

function headersOf(init?: RequestInit) {
  const source = init?.headers ?? {};
  const entries = source instanceof Headers ? Array.from(source.entries()) : Object.entries(source as Record<string, string>);
  return Object.fromEntries(entries);
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

function normalizeTestSearch(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

function forbiddenResponse() {
  return jsonResponse(
    {
      error: {
        code: "forbidden",
        message: "Actor is not permitted to perform this operation",
      },
    },
    { status: 403 },
  );
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

async function changeInputInForm(headingText: string, labelText: string, value: string) {
  const form = formByHeading(headingText);
  const input = controlByLabel<HTMLInputElement>(form, labelText, "input");
  await setInputValue(input, value);
}



async function changeSelectInArticle(articleText: string, labelText: string, value: string) {
  const article = articleByText(articleText);
  const select = controlByLabel<HTMLSelectElement>(article, labelText, "select");
  await setSelectValue(select, value);
}

async function setSelectValue(select: HTMLSelectElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;

  await act(async () => {
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitFormByHeading(headingText: string) {
  const form = formByHeading(headingText);

  await act(async () => {
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
}

function buttonInArticle(articleText: string, name: string) {
  const article = articleByText(articleText);
  const button = Array.from(article.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === name,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Could not find button ${name}`);
  }
  return button;
}

async function clickButtonInArticle(articleText: string, name: string) {
  const article = articleByText(articleText);
  const button = Array.from(article.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Could not find button ${name}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function clickButtonByName(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Could not find button ${name}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function createActorSuggestionLabels() {
  const listbox = container.querySelector(
    '[role="listbox"][aria-label="Matching collaborators for actor creation"]',
  );
  if (!listbox) return [];

  return Array.from(listbox.querySelectorAll('[role="option"]')).map(
    (option) => option.textContent?.trim() ?? "",
  );
}

async function clickCreateActorSuggestion(name: string) {
  const listbox = container.querySelector(
    '[role="listbox"][aria-label="Matching collaborators for actor creation"]',
  );
  const option = Array.from(listbox?.querySelectorAll('button[role="option"]') ?? []).find(
    (node) => node.textContent?.trim() === name,
  );
  if (!option) throw new Error(`Could not find Create actor collaborator option ${name}`);

  await act(async () => {
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function actorCardKeys() {
  return Array.from(
    container.querySelectorAll('[data-testid="authz-actor-card"] h3'),
  ).map((heading) => heading.textContent?.trim() ?? "");
}

function formByHeading(headingText: string) {
  const heading = Array.from(container.querySelectorAll("h2")).find((node) =>
    node.textContent?.includes(headingText),
  );
  if (!heading) throw new Error(`Could not find heading ${headingText}`);
  const form = heading.closest("form");
  if (!form) throw new Error(`Could not find form for heading ${headingText}`);
  return form;
}

function articleByText(text: string) {
  const article = Array.from(container.querySelectorAll("article")).find((node) =>
    node.textContent?.includes(text),
  );
  if (!article) throw new Error(`Could not find article containing ${text}`);
  return article;
}

function controlByLabel<T extends HTMLElement>(
  rootElement: ParentNode,
  labelText: string,
  selector: string,
) {
  const label = Array.from(rootElement.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(labelText),
  );
  if (!label) throw new Error(`Could not find label ${labelText}`);

  const nestedControl = label.querySelector(selector);
  if (nestedControl instanceof HTMLElement) {
    return nestedControl as T;
  }

  const controlId = label.htmlFor.trim();
  const associatedControl = controlId
    ? label.ownerDocument.getElementById(controlId)
    : null;
  const controlIsWithinRoot =
    associatedControl !== null &&
    (rootElement === label.ownerDocument ||
      (rootElement instanceof Node && rootElement.contains(associatedControl)));

  if (
    associatedControl instanceof HTMLElement &&
    controlIsWithinRoot &&
    associatedControl.matches(selector)
  ) {
    return associatedControl as T;
  }

  throw new Error(`Could not find ${selector} for ${labelText}`);
}
