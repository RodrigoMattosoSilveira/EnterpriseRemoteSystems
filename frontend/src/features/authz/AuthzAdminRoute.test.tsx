import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthzAdminRoute,
  authzAdminCurrentActorQueryKey,
} from "./AuthzAdminRoute";

vi.mock("./AuthzAdminPage", () => ({
  AuthzAdminPage: () => <p>Authorization administration loaded</p>,
}));

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: string[];

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

describe("AuthzAdminRoute", () => {
  it("mounts authorization administration after fresh application access is confirmed", async () => {
    mockCurrentActor({
      scope: "APPLICATION",
      permissions: ["*"],
    });

    renderRoute();

    await waitForText("Authorization administration loaded");
    expect(fetchCalls).toEqual(["/api/v1/authz/current-actor"]);
  });

  it("denies tenant-scoped administrators without mounting protected page queries", async () => {
    mockCurrentActor({
      scope: "TENANT",
      permissions: ["authz.manage"],
    });

    renderRoute();

    await waitForText("Authorization administration denied");
    expect(container.textContent).not.toContain(
      "Authorization administration loaded",
    );
    expect(fetchCalls).toEqual(["/api/v1/authz/current-actor"]);
  });

  it("does not trust cached actor access while the current session is being refreshed", async () => {
    let resolveCurrentActor: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        fetchCalls.push(String(input));
        return new Promise<Response>((resolve) => {
          resolveCurrentActor = resolve;
        });
      }),
    );

    const queryClient = createQueryClient();
    queryClient.setQueryData(authzAdminCurrentActorQueryKey, {
      actorKey: "previous-application-admin",
      actorRecordId: "actor-previous-application-admin",
      tenantId: "default",
      scope: "APPLICATION",
      roleCodes: ["APPLICATION_ADMIN"],
      permissions: ["*"],
    });

    renderRoute(queryClient);

    await waitForText("Checking authorization…");
    await waitFor(() => fetchCalls.length === 1);
    expect(container.textContent).not.toContain(
      "Authorization administration loaded",
    );

    await act(async () => {
      resolveCurrentActor?.(
        jsonResponse({
          data: currentActor({
            scope: "TENANT",
            permissions: ["authz.manage"],
          }),
        }),
      );
    });

    await waitForText("Authorization administration denied");
    expect(fetchCalls).toEqual(["/api/v1/authz/current-actor"]);
  });

  it("does not retry a denied current-actor request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        fetchCalls.push(String(input));
        return jsonResponse(
          {
            error: {
              code: "forbidden",
              message: "Actor is not permitted to perform this operation",
            },
          },
          { status: 403 },
        );
      }),
    );

    renderRoute();

    await waitForText("Authorization administration denied");
    expect(fetchCalls).toEqual(["/api/v1/authz/current-actor"]);
  });
});

function renderRoute(queryClient = createQueryClient()) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/authorization",
        element: <AuthzAdminRoute />,
        errorElement: <p>Authorization administration denied</p>,
      },
    ],
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

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function mockCurrentActor(input: {
  scope: string;
  permissions: string[];
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: RequestInfo | URL) => {
      fetchCalls.push(String(request));
      return jsonResponse({ data: currentActor(input) });
    }),
  );
}

function currentActor(input: { scope: string; permissions: string[] }) {
  return {
    actorKey: "session-actor",
    actorRecordId: "actor-session-actor",
    tenantId: "default",
    scope: input.scope,
    roleCodes:
      input.scope === "APPLICATION" ? ["APPLICATION_ADMIN"] : ["TENANT_ADMIN"],
    permissions: input.permissions,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function waitForText(text: string) {
  await waitFor(() => container.textContent?.includes(text) === true);
}

async function waitFor(assertion: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (assertion()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Timed out waiting for condition. DOM: ${container.innerHTML}`);
}
