import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PersonAuthenticationSection } from "./PersonAuthenticationSection";

const PERSON_ID = "person-authentication-1";
const LOGIN = "manual30c2.person1@example.test";
const TEMPORARY_PASSWORD = "Manual-30C-Password!";

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

describe("PersonAuthenticationSection", () => {
  it("confirms the temporary password and shows the authoritative login after provisioning", async () => {
    let enabled = false;
    mockFetch(async (url, init) => {
      fetchCalls.push({
        url,
        method: init?.method?.toUpperCase() ?? "GET",
        body: parseBody(init?.body),
      });

      if (url === `/api/v1/people/${PERSON_ID}/authentication` && !enabled) {
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: false,
            accountActive: false,
            canRequestReactivation: false,
            requiresTemporaryPassword: true,
            status: "NOT_ENABLED",
          },
        });
      }

      if (
        url === `/api/v1/people/${PERSON_ID}/authentication/enable` &&
        init?.method === "POST"
      ) {
        enabled = true;
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: true,
            accountActive: true,
            canRequestReactivation: false,
            requiresTemporaryPassword: false,
            status: "ENABLED",
          },
        });
      }

      if (url === `/api/v1/people/${PERSON_ID}/authentication` && enabled) {
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: true,
            accountActive: true,
            canRequestReactivation: false,
            requiresTemporaryPassword: false,
            status: "ENABLED",
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderSection();

    await waitForText(`Account login: ${LOGIN}`);
    const password = inputByLabel("Initial temporary password");
    const confirmation = inputByLabel("Confirm temporary password");
    const enableButton = buttonByText("Enable Authentication");

    await changeInput(password, TEMPORARY_PASSWORD);
    await changeInput(confirmation, "Different-Password-1!");

    expect(enableButton.disabled).toBe(true);
    await waitForText("The temporary passwords do not match.");
    expect(fetchCalls.filter((call) => call.method === "POST")).toHaveLength(0);

    await changeInput(confirmation, TEMPORARY_PASSWORD);
    expect(enableButton.disabled).toBe(false);

    await act(async () => {
      enableButton.click();
    });

    await waitFor(() => fetchCalls.some((call) => call.method === "POST"));
    const enableCall = fetchCalls.find((call) => call.method === "POST");
    expect(enableCall?.url).toBe(`/api/v1/people/${PERSON_ID}/authentication/enable`);
    expect(enableCall?.body).toEqual({ temporaryPassword: TEMPORARY_PASSWORD });

    await waitForText(`Authentication is enabled for this tenant. Account login: ${LOGIN}.`);
  });

  it("fails safe when an older backend omits requiresTemporaryPassword", async () => {
    let enabled = false;
    mockFetch(async (url, init) => {
      fetchCalls.push({
        url,
        method: init?.method?.toUpperCase() ?? "GET",
        body: parseBody(init?.body),
      });

      if (url === `/api/v1/people/${PERSON_ID}/authentication` && !enabled) {
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: false,
            accountActive: false,
            canRequestReactivation: false,
            status: "NOT_ENABLED",
          },
        });
      }

      if (
        url === `/api/v1/people/${PERSON_ID}/authentication/enable` &&
        init?.method === "POST"
      ) {
        enabled = true;
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: true,
            accountActive: true,
            canRequestReactivation: false,
            requiresTemporaryPassword: false,
            status: "ENABLED",
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderSection();

    await waitForText("Status: Not enabled for this tenant");
    const password = inputByLabel("Initial temporary password");
    const confirmation = inputByLabel("Confirm temporary password");
    const enableButton = buttonByText("Enable Authentication");

    expect(enableButton.disabled).toBe(true);
    await changeInput(password, TEMPORARY_PASSWORD);
    await changeInput(confirmation, TEMPORARY_PASSWORD);
    expect(enableButton.disabled).toBe(false);

    await act(async () => {
      enableButton.click();
    });

    await waitFor(() => fetchCalls.some((call) => call.method === "POST"));
    const enableCall = fetchCalls.find((call) => call.method === "POST");
    expect(enableCall?.body).toEqual({ temporaryPassword: TEMPORARY_PASSWORD });
  });

  it("lets a Tenant Administrator issue a reset token for an enabled Person in the selected tenant", async () => {
    mockFetch(async (url, init) => {
      fetchCalls.push({
        url,
        method: init?.method?.toUpperCase() ?? "GET",
        body: parseBody(init?.body),
      });

      if (url === `/api/v1/people/${PERSON_ID}/authentication`) {
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: true,
            accountActive: true,
            canRequestReactivation: false,
            requiresTemporaryPassword: false,
            status: "ENABLED",
          },
        });
      }

      if (
        url === `/api/v1/people/${PERSON_ID}/authentication/password-reset-tokens` &&
        init?.method === "POST"
      ) {
        return jsonResponse(
          {
            data: {
              accountId: "account-1",
              login: LOGIN,
              token: "ers_pr_tenant_reset_token",
              expiresAt: "2030-01-01T00:00:00Z",
            },
          },
          { status: 201 },
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderSection();

    await waitForText("Status: Enabled");
    await waitForText("global Authentication Account password");
    const resetButton = buttonByText("Issue password reset token");

    await act(async () => {
      resetButton.click();
    });

    await waitForText(`One-time reset token for ${LOGIN}`);
    await waitForText("ers_pr_tenant_reset_token");
    const resetCall = fetchCalls.find(
      (call) => call.url.endsWith("/authentication/password-reset-tokens") && call.method === "POST",
    );
    expect(resetCall?.url).toBe(
      `/api/v1/people/${PERSON_ID}/authentication/password-reset-tokens`,
    );
  });

  it("enables a second tenant without asking for or sending a temporary password", async () => {
    let enabled = false;
    mockFetch(async (url, init) => {
      fetchCalls.push({
        url,
        method: init?.method?.toUpperCase() ?? "GET",
        body: parseBody(init?.body),
      });

      if (url === `/api/v1/people/${PERSON_ID}/authentication` && !enabled) {
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: false,
            accountActive: false,
            canRequestReactivation: false,
            requiresTemporaryPassword: false,
            status: "NOT_ENABLED",
          },
        });
      }

      if (
        url === `/api/v1/people/${PERSON_ID}/authentication/enable` &&
        init?.method === "POST"
      ) {
        enabled = true;
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: true,
            accountActive: true,
            canRequestReactivation: false,
            requiresTemporaryPassword: false,
            status: "ENABLED",
          },
        });
      }

      if (url === `/api/v1/people/${PERSON_ID}/authentication` && enabled) {
        return jsonResponse({
          data: {
            login: LOGIN,
            enabled: true,
            accountActive: true,
            canRequestReactivation: false,
            requiresTemporaryPassword: false,
            status: "ENABLED",
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderSection();

    await waitForText("Status: Not enabled for this tenant");
    expect(container.textContent).toContain(
      "No credential changes are required for this operation.",
    );
    expect(
      Array.from(container.querySelectorAll("label")).some((node) =>
        node.textContent?.includes("Initial temporary password"),
      ),
    ).toBe(false);
    expect(
      Array.from(container.querySelectorAll("label")).some((node) =>
        node.textContent?.includes("Confirm temporary password"),
      ),
    ).toBe(false);

    const enableButton = buttonByText("Enable Authentication");
    expect(enableButton.disabled).toBe(false);

    await act(async () => {
      enableButton.click();
    });

    await waitFor(() => fetchCalls.some((call) => call.method === "POST"));
    const enableCall = fetchCalls.find((call) => call.method === "POST");
    expect(enableCall?.url).toBe(`/api/v1/people/${PERSON_ID}/authentication/enable`);
    expect(enableCall?.body).toEqual({});

    await waitForText(
      `Authentication is enabled for this tenant. Account login: ${LOGIN}. Account credentials were not changed.`,
    );
  });
  it("lets a Tenant Administrator reactivate an operationally inactive Person for only this Tenant", async () => {
    let reactivated = false;
    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: init?.method?.toUpperCase() ?? "GET", body: parseBody(init?.body) });
      if (url === `/api/v1/people/${PERSON_ID}/authentication`) {
        return jsonResponse({ data: reactivated
          ? { login: LOGIN, enabled: true, accountActive: true, membershipActive: true, operationalActive: true, canTenantReactivate: false, canRequestReactivation: false, requiresTemporaryPassword: false, status: "ENABLED" }
          : { login: LOGIN, enabled: true, accountActive: false, membershipActive: false, operationalActive: false, canTenantReactivate: true, canRequestReactivation: false, requiresTemporaryPassword: false, status: "OPERATIONALLY_INACTIVE" } });
      }
      if (url === `/api/v1/people/${PERSON_ID}/reactivate` && init?.method === "POST") {
        reactivated = true;
        return jsonResponse({ data: { id: PERSON_ID } });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderSection();
    await waitForText("Status: Operationally inactive");
    const button = buttonByText("Reactivate Person for this Tenant");
    await act(async () => { button.click(); });
    await waitForText("Previous delegated privileges remain suspended");
    expect(fetchCalls.some((call) => call.url === `/api/v1/people/${PERSON_ID}/reactivate` && call.method === "POST")).toBe(true);
  });


  it("describes an inactive Membership separately after another Tenant has reactivated the Person", async () => {
    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: init?.method?.toUpperCase() ?? "GET", body: parseBody(init?.body) });
      if (url === `/api/v1/people/${PERSON_ID}/authentication`) {
        return jsonResponse({ data: { login: LOGIN, enabled: true, accountActive: true, membershipActive: false, operationalActive: true, canTenantReactivate: true, canRequestReactivation: false, requiresTemporaryPassword: false, status: "TENANT_INACTIVE" } });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderSection();
    await waitForText("Status: Inactive in this Tenant");
    expect(container.textContent).toContain("Reactivate Person for this Tenant");
  });

  it("routes a security-suspended Account to Application Administrator review instead of Tenant reactivation", async () => {
    mockFetch(async (url, init) => {
      fetchCalls.push({ url, method: init?.method?.toUpperCase() ?? "GET", body: parseBody(init?.body) });
      if (url === `/api/v1/people/${PERSON_ID}/authentication`) {
        return jsonResponse({ data: { login: LOGIN, enabled: true, accountActive: false, securitySuspended: true, membershipActive: false, operationalActive: false, canTenantReactivate: false, canRequestReactivation: true, requiresTemporaryPassword: false, status: "SECURITY_SUSPENDED" } });
      }
      if (url === `/api/v1/people/${PERSON_ID}/authentication/reactivation-request` && init?.method === "POST") {
        return jsonResponse({ data: { status: "PENDING" } });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderSection();
    await waitForText("Status: Application security suspension");
    expect(container.textContent).not.toContain("Reactivate Person for this Tenant");
    const button = buttonByText("Request Application Administrator Review");
    await act(async () => { button.click(); });
    await waitForText("Application Administrator will review it");
  });

});

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  root = createRoot(container);
  act(() => {
    root?.render(
      <QueryClientProvider client={queryClient}>
        <PersonAuthenticationSection personId={PERSON_ID} />
      </QueryClientProvider>,
    );
  });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      return handler(url, init);
    },
  );
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

  if (lastError) throw lastError;
  throw new Error("Timed out waiting for assertion");
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("*")).find((element) =>
    element.textContent?.includes(text),
  );
}

function inputByLabel(labelText: string) {
  const label = Array.from(container.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(labelText),
  );
  const input = label?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input not found for label: ${labelText}`);
  }
  return input;
}

function buttonByText(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === text,
  );
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }
  return button;
}

async function changeInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
