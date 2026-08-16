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
