import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../../app/i18n";
import { SecondPersonApprovalSettingsPage } from "./SecondPersonApprovalSettingsPage";
import type { SecondPersonApprovalPolicy } from "../../types/currentAccounts";

let policy: SecondPersonApprovalPolicy;
let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: FetchCall[];

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
};

beforeEach(() => {
  void i18n.changeLanguage("en");
  policy = {
    tenantId: "default",
    required: false,
    updatedBy: "bootstrap-admin",
    updatedAt: "2026-06-19T12:00:00Z",
  };
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
  vi.restoreAllMocks();
});

describe("SecondPersonApprovalSettingsPage", () => {
  it("loads the policy with the selected tenant and session credentials", async () => {
    mockPolicyFetch();

    renderPage();

    await waitForText("Second-person approval");
    await waitForText("Optional");
    await waitForText("Operational warning");

    const getCall = fetchCalls.find(
      (call) => call.url === "/api/v1/current-accounts/settings/second-person-approval" && call.method === "GET",
    );
    expect(getCall?.headers["X-Actor-ID"]).toBeUndefined();
    expect(getCall?.headers["X-Tenant-ID"]).toBe("default");
  });

  it("enables second-person approval", async () => {
    mockPolicyFetch();

    renderPage();

    await waitForText("Optional");
    await clickCheckbox("Require second-person approval for sensitive current-account operations");
    await clickButton("Save Policy");

    await waitForText("Second-person approval is now required for sensitive current-account operations.");
    await waitForText("Required");

    const updateCall = fetchCalls.find(
      (call) => call.url === "/api/v1/current-accounts/settings/second-person-approval" && call.method === "PUT",
    );
    expect(updateCall?.body).toEqual({ required: true });
  });

  it("shows backend authorization errors when update is forbidden", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);
      const method = methodOf(init);

      if (url === "/api/v1/current-accounts/settings/second-person-approval" && method === "GET") {
        return jsonResponse({ data: policy });
      }

      if (url === "/api/v1/current-accounts/settings/second-person-approval" && method === "PUT") {
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

      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage();

    await waitForText("Optional");
    await clickCheckbox("Require second-person approval for sensitive current-account operations");
    await clickButton("Save Policy");

    await waitForText("You are not permitted to perform this operation.");
  });

  it("renders localized Portuguese labels", async () => {
    void i18n.changeLanguage("pt-BR");
    mockPolicyFetch();

    renderPage();

    await waitForText("Aprovação de segunda pessoa");
    await waitForText("Aviso operacional");
    await waitForText("Salvar política");
  });
});

function mockPolicyFetch() {
  mockFetch(async (url, init) => {
    recordFetchCall(url, init);
    const method = methodOf(init);

    if (url === "/api/v1/current-accounts/settings/second-person-approval" && method === "GET") {
      return jsonResponse({ data: policy });
    }

    if (url === "/api/v1/current-accounts/settings/second-person-approval" && method === "PUT") {
      const body = parseBody(init?.body) as { required: boolean };
      policy = {
        ...policy,
        required: body.required,
        updatedBy: "bootstrap-admin",
        updatedAt: "2026-06-19T12:05:00Z",
      };
      return jsonResponse({ data: policy });
    }

    throw new Error(`Unhandled request: ${url}`);
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/admin/current-account-settings", element: <SecondPersonApprovalSettingsPage /> }],
    { initialEntries: ["/admin/current-account-settings"] },
  );

  act(() => {
    root = createRoot(container);
    root.render(
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </I18nextProvider>,
    );
  });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }));
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function recordFetchCall(url: string, init?: RequestInit) {
  fetchCalls.push({
    url,
    method: methodOf(init),
    headers: normalizeHeaders(init?.headers),
    body: parseBody(init?.body),
  });
}

function methodOf(init?: RequestInit) {
  return init?.method?.toUpperCase() ?? "GET";
}

function normalizeHeaders(headers: HeadersInit | undefined) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

function parseBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string" || !body) return undefined;
  return JSON.parse(body);
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (textNode(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Text not found: ${text}`);
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("body *")).find((element) =>
    element.textContent?.includes(text),
  );
}

async function clickCheckbox(labelText: string) {
  const label = Array.from(container.querySelectorAll("label")).find((element) =>
    element.textContent?.includes(labelText),
  );
  const input = label?.querySelector("input[type='checkbox']") as HTMLInputElement | null;
  if (!input) throw new Error(`Checkbox not found: ${labelText}`);

  await act(async () => {
    input.click();
  });
}

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find((element) =>
    element.textContent?.includes(name),
  ) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Button not found: ${name}`);

  await act(async () => {
    button.click();
  });
}
