import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    id: "authz-role-expense-operator",
    code: "EXPENSE_OPERATOR",
    label: "Expense Operator",
    description: "Expense operations",
    scopeType: "tenant",
    active: true,
    permissions: [{ code: "expenses.create", label: "Create Expenses", description: "" }],
  },
];

const permissions = [
  { code: "authz.read", label: "Read Authorization", description: "Read authz data" },
  { code: "authz.manage", label: "Manage Authorization", description: "Manage authz data" },
];

let actors = [
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
  it("lists roles, permissions, and actors using persisted actor headers", async () => {
    mockAuthzFetch();

    renderAuthzAdminPage();

    await waitForText("APPLICATION_ADMIN");
    await waitForText("authz.manage");
    await waitForText("Bootstrap Admin");

    expect(fetchCalls.some((call) => call.url === "/api/v1/authz/roles")).toBe(true);
    expect(fetchCalls.some((call) => call.url === "/api/v1/authz/permissions")).toBe(true);
    expect(fetchCalls.some((call) => call.url === "/api/v1/authz/actors")).toBe(true);
    expect(fetchCalls.every((call) => call.headers["X-Actor-ID"] === "bootstrap-admin")).toBe(true);
    expect(fetchCalls.every((call) => call.headers["X-Tenant-ID"] === "default")).toBe(true);
  });

  it("creates an actor", async () => {
    mockAuthzFetch();

    renderAuthzAdminPage();
    await waitForText("Bootstrap Admin");

    await changeInputInForm("Create actor", "Actor key", "expense-admin");
    await changeInputInForm("Create actor", "Display name", "Expense Admin");
    await submitFormByHeading("Create actor");

    await waitForText("expense-admin created.");

    const createCall = fetchCalls.find((call) => call.url === "/api/v1/authz/actors" && call.method === "POST");
    expect(createCall?.body).toMatchObject({
      actorKey: "expense-admin",
      displayName: "Expense Admin",
      active: true,
    });
  });

  it("grants and revokes actor roles", async () => {
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

    await changeSelectInArticle("expense-admin", "Role", "EXPENSE_OPERATOR");
    await changeInputInArticle("expense-admin", "Grant tenant", "default");
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

  it("shows backend authorization errors", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);
      return jsonResponse(
        {
          error: {
            code: "forbidden",
            message: "Actor is not permitted to perform this operation",
          },
        },
        { status: 403 },
      );
    });

    renderAuthzAdminPage();

    await waitForText("Actor is not permitted to perform this operation");
  });
});

function resetAuthzAdminLocalStorage() {
  const storage = window.localStorage as Storage & { clear?: () => void };

  if (typeof storage.removeItem === "function") {
    storage.removeItem("ers.authzAdmin.requestActor");
    return;
  }

  if (typeof storage.setItem === "function") {
    storage.setItem("ers.authzAdmin.requestActor", "");
  }
}

function mockAuthzFetch() {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);
    const method = methodOf(init);

    if (url === "/api/v1/authz/roles" && method === "GET") {
      return jsonResponse({ data: roles });
    }
    if (url === "/api/v1/authz/permissions" && method === "GET") {
      return jsonResponse({ data: permissions });
    }
    if (url === "/api/v1/authz/actors" && method === "GET") {
      return jsonResponse({ data: actors });
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
      const grant = actors.find((actor) => actor.id === "actor-expense-admin")?.roleGrants[0];
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

async function changeInputInArticle(articleText: string, labelText: string, value: string) {
  const article = articleByText(articleText);
  const input = controlByLabel<HTMLInputElement>(article, labelText, "input");
  await setInputValue(input, value);
}

async function changeSelectInArticle(articleText: string, labelText: string, value: string) {
  const article = articleByText(articleText);
  const select = controlByLabel<HTMLSelectElement>(article, labelText, "select");
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

function controlByLabel<T extends HTMLElement>(rootElement: ParentNode, labelText: string, selector: string) {
  const label = Array.from(rootElement.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(labelText),
  );
  if (!label) throw new Error(`Could not find label ${labelText}`);
  const control = label.querySelector(selector) as T | null;
  if (!control) throw new Error(`Could not find ${selector} for ${labelText}`);
  return control;
}
