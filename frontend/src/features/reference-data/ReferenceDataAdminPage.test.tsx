import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReferenceDataAdminPage } from "./ReferenceDataAdminPage";
import type { ReferenceDataItem } from "../../types/referenceData";

const sectorRows: ReferenceDataItem[] = [
  {
    id: "ref-sector-mining",
    tenantId: "default",
    type: "sector",
    code: "MINING",
    label: "Mining",
    description: "Mining operations",
    active: true,
    sortOrder: 10,
  },
];

const personStatusRows: ReferenceDataItem[] = [
  {
    id: "ref-person-status-active",
    tenantId: "default",
    type: "person_status",
    code: "ACTIVE",
    label: "Active",
    description: "Currently under contract",
    active: true,
    sortOrder: 10,
  },
];

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

describe("ReferenceDataAdminPage", () => {
  it("lists reference data filtered by type", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === "/api/v1/reference-data/person_status") {
        return jsonResponse({ data: personStatusRows });
      }

      if (url === "/api/v1/reference-data/sector") {
        return jsonResponse({ data: sectorRows });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderReferenceDataAdminPage();

    await waitForText("Currently under contract");
    expect(textNode("Active")).toBeTruthy();

    await changeSelect("Reference data type", "sector");

    await waitForText("Mining");
    expect(fetchCalls.some((call) => call.url === "/api/v1/reference-data/sector")).toBe(true);
  });

  it("creates a reference data item", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === "/api/v1/reference-data/person_status" && methodOf(init) === "GET") {
        return jsonResponse({ data: personStatusRows });
      }

      if (url === "/api/v1/reference-data/person_status" && methodOf(init) === "POST") {
        return jsonResponse(
          {
            data: {
              id: "ref-person-status-suspended",
              tenantId: "default",
              type: "person_status",
              code: "SUSPENDED",
              label: "Suspended",
              description: "Temporarily unavailable",
              active: true,
              sortOrder: 40,
            },
          },
          { status: 201 }
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderReferenceDataAdminPage();
    await waitForText("Currently under contract");

    await changeInputInForm("Create Person Status", "Code", "suspended");
    await changeInputInForm("Create Person Status", "Name", "Suspended");
    await changeInputInForm("Create Person Status", "Description", "Temporarily unavailable");
    await changeInputInForm("Create Person Status", "Sort Order", "40");
    await submitFormByHeading("Create Person Status");

    await waitForText("Suspended created.");

    const createCall = fetchCalls.find((call) => call.method === "POST");
    expect(createCall?.url).toBe("/api/v1/reference-data/person_status");
    expect(createCall?.body).toMatchObject({
      code: "suspended",
      label: "Suspended",
      description: "Temporarily unavailable",
      active: true,
      sortOrder: 40,
      metadataJson: "",
    });
  });

  it("updates a reference data item", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === "/api/v1/reference-data/person_status" && methodOf(init) === "GET") {
        return jsonResponse({ data: personStatusRows });
      }

      if (
        url === "/api/v1/reference-data/person_status/ref-person-status-active" &&
        methodOf(init) === "PUT"
      ) {
        return jsonResponse({
          data: {
            ...personStatusRows[0],
            label: "Active Person",
          },
        });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderReferenceDataAdminPage();
    await waitForText("Currently under contract");

    await clickButton("Edit");
    await waitForText("Edit Active");
    await changeInputInForm("Edit Active", "Name", "Active Person");
    await submitFormByHeading("Edit Active");

    await waitForText("Active Person updated.");

    const updateCall = fetchCalls.find((call) => call.method === "PUT");
    expect(updateCall?.url).toBe("/api/v1/reference-data/person_status/ref-person-status-active");
    expect(updateCall?.body).toMatchObject({
      code: "ACTIVE",
      label: "Active Person",
      description: "Currently under contract",
      active: true,
      sortOrder: 10,
    });
  });

  it("deactivates and reactivates a reference data item", async () => {
    let active = true;

    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === "/api/v1/reference-data/person_status" && methodOf(init) === "GET") {
        return jsonResponse({ data: [{ ...personStatusRows[0], active }] });
      }

      if (
        url === "/api/v1/reference-data/person_status/ref-person-status-active/deactivate" &&
        methodOf(init) === "PATCH"
      ) {
        active = false;
        return jsonResponse({ data: { ...personStatusRows[0], active } });
      }

      if (
        url === "/api/v1/reference-data/person_status/ref-person-status-active/reactivate" &&
        methodOf(init) === "PATCH"
      ) {
        active = true;
        return jsonResponse({ data: { ...personStatusRows[0], active } });
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderReferenceDataAdminPage();
    await waitForText("Currently under contract");

    await clickButton("Deactivate");
    await waitForText("Active deactivated.");
    await waitForText("Reactivate");
    expect(fetchCalls.some((call) => call.url.endsWith("/deactivate") && call.method === "PATCH")).toBe(true);

    await clickButton("Reactivate");
    await waitForText("Active reactivated.");
    expect(fetchCalls.some((call) => call.url.endsWith("/reactivate") && call.method === "PATCH")).toBe(true);
  });

  it("shows backend validation errors", async () => {
    mockFetch(async (url, init) => {
      recordFetchCall(url, init);

      if (url === "/api/v1/reference-data/person_status" && methodOf(init) === "GET") {
        return jsonResponse({ data: personStatusRows });
      }

      if (url === "/api/v1/reference-data/person_status" && methodOf(init) === "POST") {
        return jsonResponse(
          {
            error: {
              code: "validation_failed",
              message: "Validation failed",
              fields: {
                label: "Name already exists for this type",
              },
            },
          },
          { status: 400 }
        );
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderReferenceDataAdminPage();
    await waitForText("Currently under contract");

    await changeInputInForm("Create Person Status", "Code", "ACTIVE_2");
    await changeInputInForm("Create Person Status", "Name", "Active");
    await submitFormByHeading("Create Person Status");

    await waitForText("Validation failed");
    await waitForText("label:");
    await waitForText("Name already exists for this type");
  });
});

function renderReferenceDataAdminPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/admin/reference-data", element: <ReferenceDataAdminPage /> }],
    { initialEntries: ["/admin/reference-data"] }
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

    await new Promise((resolve) => setTimeout(resolve, 10));
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

async function changeSelect(labelText: string, value: string) {
  const select = controlByLabel<HTMLSelectElement>(container, labelText, "select");
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

async function changeInputInForm(headingText: string, labelText: string, value: string) {
  const form = formByHeading(headingText);
  const input = controlByLabel<HTMLInputElement | HTMLTextAreaElement>(
    form,
    labelText,
    labelText === "Metadata JSON" ? "textarea" : "input"
  );
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

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

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === name
  );
  if (!button) throw new Error(`Could not find button ${name}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function formByHeading(headingText: string) {
  const heading = Array.from(container.querySelectorAll("h2")).find((node) =>
    node.textContent?.includes(headingText)
  );
  const form = heading?.closest("form");
  if (!form) throw new Error(`Could not find form for heading ${headingText}`);
  return form;
}

function controlByLabel<T extends HTMLElement>(
  rootElement: ParentNode,
  labelText: string,
  selector: "input" | "select" | "textarea"
): T {
  const label = Array.from(rootElement.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(labelText)
  );

  const control = label?.querySelector(selector);
  if (!control) {
    throw new Error(`Could not find ${selector} for label ${labelText}`);
  }

  return control as unknown as T;
}
