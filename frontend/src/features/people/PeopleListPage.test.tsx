import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTHZ_REQUEST_ACTOR_STORAGE_KEY } from "../../api/requestActorBootstrap";
import { PeopleListPage } from "./PeopleListPage";
import type { Person } from "../../types/people";

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: string[];

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchCalls = [];
});

afterEach(async () => {
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
  });
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  document.body.removeChild(container);
  window.localStorage.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("PeopleListPage", () => {
  it("loads the first paginated People page and renders filter controls", async () => {
    mockPeopleFetch({ items: [personFixture("person-1", "Maria")], total: 1 });

    renderPeopleListRoute();

    await waitForText("Maria Pessoa");

    expect(fetchCalls[0]).toBe("/api/v1/people?page=1&pageSize=10");
    expect(textNode("Filters")).toBeTruthy();
    expect(inputByLabel("Filter people")).toBeTruthy();
    expect(selectByLabel("People per page").value).toBe("10");
    expect(textNode("Showing 1-1 of 1 people")).toBeTruthy();
  });

  it("clears filters resets search input and removes search param", async () => {
    mockPeopleFetch({ items: [personFixture("person-1", "Maria")], total: 1 });

    renderPeopleListRoute();
    await waitForText("Maria Pessoa");

    await changeInput("Filter people", "Mar");
    act(() => vi.advanceTimersByTime(400));
    await waitFor(() =>
      fetchCalls.some((url) => url.includes("search=Mar")),
    );

    await clickButton("Clear filters");

    await waitFor(() =>
      fetchCalls.includes("/api/v1/people?page=1&pageSize=10"),
    );
    expect(inputByLabel("Filter people").value).toBe("");
  });

  it("applies active/inactive filter immediately", async () => {
    mockPeopleFetch({ items: [personFixture("person-1", "Maria")], total: 1 });

    renderPeopleListRoute();
    await waitForText("Maria Pessoa");

    await changeSelect("Status", "Active");

    await waitFor(() =>
      fetchCalls.includes(
        "/api/v1/people?statusId=ref-person-status-active&page=1&pageSize=10",
      ),
    );
  });

  it("clears status filter when All is selected", async () => {
    mockPeopleFetch({ items: [personFixture("person-1", "Maria")], total: 1 });

    renderPeopleListRoute();
    await waitForText("Maria Pessoa");

    await changeSelect("Status", "All");

    await waitFor(() =>
      fetchCalls.includes("/api/v1/people?page=1&pageSize=10"),
    );
  });

  it("offers the shared local actor recovery when People access is forbidden", async () => {
    window.localStorage.setItem(
      AUTHZ_REQUEST_ACTOR_STORAGE_KEY,
      JSON.stringify({ actorId: "restricted-actor", tenantId: "default" }),
    );
    mockPeopleForbidden();

    renderPeopleListRoute();

    await waitForText("Actor is not permitted to perform this operation");
    expect(textNode("restricted-actor")).toBeTruthy();
    expect(textNode("Use bootstrap-admin and reload")).toBeTruthy();
    expect(container.querySelector("pre")).toBeNull();
  });

  /*

    it("debounces search input and fires API request after delay", async () => {
    mockPeopleFetch({ items: [personFixture("person-1", "Fin")], total: 1 });

    renderPeopleListRoute();
    await waitForText("Maria Pessoa");

    // Type "Mar" — no API call yet
    await changeInput("Filter people", "Fin");
    expect(
      fetchCalls.some((url) => url.includes("search=Fin")),
    ).toBe(false);

    // Advance timers past debounce (350ms)
    act(() => {
      vi.advanceTimersByTime(400);
    });

    await waitFor(() =>
      fetchCalls.includes("/api/v1/people?search=Mar&page=1&pageSize=10"),
    );
  });


  it("applies profile completion filter immediately (no debounce)", async () => {
    mockPeopleFetch({ items: [personFixture("person-1", "Maria")], total: 1 });

    renderPeopleListRoute();
    await waitForText("Maria Pessoa");

    await changeSelect("Profile completion", "COMPLETE");

    // No debounce on select — immediate
    await waitFor(() =>
      fetchCalls.includes(
        "/api/v1/people?profileCompletionStatus=COMPLETE&page=1&pageSize=10",
      ),
    );
  }); */

});

// ─── Helpers ───────────────────────────────────────────────────────────────

function renderPeopleListRoute() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [{ path: "/people", element: <PeopleListPage /> }],
    { initialEntries: ["/people"] },
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

function mockPeopleFetch(response: { items: Person[]; total: number }) {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push(url);

      if (url.startsWith("/api/v1/people")) {
        return jsonResponse({ data: response });
      }

      throw new Error(`Unhandled request: ${url}`);
    },
  );
}

function mockPeopleForbidden() {
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      fetchCalls.push(url);

      if (url.startsWith("/api/v1/people")) {
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
    },
  );
}

function personFixture(id: string, firstName: string): Person {
  return {
    id,
    firstName,
    lastName: "Pessoa",
    nickname: firstName,
    cpf: `${id}-cpf`,
    rg: `${id}-rg`,
    cellular: "11987654321",
    email: `${id}@example.com`,
    country: "Brasil",
    profileCompletionStatus: "INCOMPLETE",
    canCreateCollaborator: false,
    missingSections: ["Address", "Bank", "Emergency"],
    statusId: "ref-person-status-active",
    statusLabel: "Active",
  };
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
    element.textContent?.includes(text),
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
  selector: "input" | "select",
): T {
  const labels = Array.from(container.querySelectorAll("label"));
  const label = labels.find((node) => node.textContent?.includes(labelText));

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
    "value",
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
    "value",
  )?.set;

  await act(async () => {
    valueSetter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function submitFilterForm() {
  const form = container.querySelector("form");
  if (!form) throw new Error("Could not find filter form");

  await act(async () => {
    form.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
  });
}

async function clickButton(name: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent?.trim() === name,
  );
  if (!button) throw new Error(`Could not find button ${name}`);

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}