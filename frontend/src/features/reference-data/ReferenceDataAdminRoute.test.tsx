import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import type { AuthzCurrentActor } from "../../types/authz";
import { ReferenceDataAdminRoute } from "./ReferenceDataAdminRoute";

vi.mock("./ReferenceDataAdminPage", () => ({
  ReferenceDataAdminPage: () => <p>Reference Data administration loaded</p>,
}));

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
});

describe("ReferenceDataAdminRoute", () => {
  it("denies an Expense Operator that can read operational reference data but cannot manage it", async () => {
    const router = renderRoute(
      currentActor({
        roleCodes: ["EXPENSE_OPERATOR"],
        permissions: ["reference_data.read", "expenses.read", "expenses.create"],
      }),
    );

    await waitFor(() => router.state.location.pathname === "/forbidden");

    expect(container.textContent).toContain("Access forbidden");
    expect(container.textContent).not.toContain(
      "Reference Data administration loaded",
    );
  });

  it("allows an actor with reference-data management permission", async () => {
    const router = renderRoute(
      currentActor({
        roleCodes: ["TENANT_ADMIN"],
        permissions: ["reference_data.manage"],
      }),
    );

    await waitFor(() =>
      container.textContent?.includes("Reference Data administration loaded") ===
      true,
    );

    expect(router.state.location.pathname).toBe("/admin/reference-data");
  });
});

function renderRoute(actor: AuthzCurrentActor) {
  const router = createMemoryRouter(
    [
      {
        path: "/admin/reference-data",
        element: (
          <AuthorizationProvider value={actor}>
            <ReferenceDataAdminRoute />
          </AuthorizationProvider>
        ),
      },
      {
        path: "/forbidden",
        element: <p>Access forbidden</p>,
      },
    ],
    { initialEntries: ["/admin/reference-data"] },
  );

  root = createRoot(container);
  act(() => {
    root?.render(<RouterProvider router={router} />);
  });

  return router;
}

function currentActor(input: {
  roleCodes: string[];
  permissions: string[];
}): AuthzCurrentActor {
  return {
    actorKey: "reference-data-route-test",
    actorRecordId: "actor-reference-data-route-test",
    tenantId: "default",
    scope: "TENANT",
    roleCodes: input.roleCodes,
    permissions: input.permissions,
  };
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
