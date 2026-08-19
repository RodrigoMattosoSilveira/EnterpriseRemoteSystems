import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthState } from "../../app/authStore";
import { RequireAuth } from "./RequireAuth";

const revalidateAuthSession = vi.fn<() => Promise<AuthState>>();

vi.mock("../../app/authStore", () => ({
  initializeAuthSession: vi.fn(),
  revalidateAuthSession: () => revalidateAuthSession(),
}));

vi.mock("../../app/useAuth", () => ({
  useAuthState: () => authenticatedState,
}));

const authenticatedState: AuthState = {
  status: "authenticated",
  session: {
    accountId: "account-session-test",
    actorId: "actor-session-test",
    actorKey: "session-test",
    login: "session-test@example.com",
    displayName: "Session Test",
    mustChangePassword: false,
    expiresAt: "2026-08-06T12:00:00Z",
  },
  error: null,
  reason: null,
};

let container: HTMLDivElement;
let root: Root | null;
let mountCount: number;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  mountCount = 0;
  revalidateAuthSession.mockReset();
  revalidateAuthSession.mockResolvedValue(authenticatedState);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
  }
  document.body.removeChild(container);
});

describe("RequireAuth", () => {
  it("preserves the mounted page for query-string-only UI navigation", async () => {
    renderGuard("/people?view=cards");

    await waitFor(() => container.textContent?.includes("Mounted 1") === true);
    expect(revalidateAuthSession).toHaveBeenCalledTimes(0);

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });

    await waitFor(() =>
      container.textContent?.includes("Location /people?view=list") === true,
    );

    expect(mountCount).toBe(1);
    expect(revalidateAuthSession).toHaveBeenCalledTimes(0);
    expect(container.textContent).not.toContain("Verifying your session");
  });

  it("does not duplicate the fresh-session validation during StrictMode effect replay", async () => {
    renderGuard("/people", true);

    await waitFor(() => container.textContent?.includes("Location /people") === true);
    expect(revalidateAuthSession).toHaveBeenCalledTimes(0);
  });

  it("keeps the mounted page while a focus revalidation is pending", async () => {
    renderGuard("/admin/authentication");

    await waitFor(() => container.textContent?.includes("Mounted 1") === true);
    expect(revalidateAuthSession).toHaveBeenCalledTimes(0);

    let resolveFocusValidation: ((state: AuthState) => void) | undefined;
    revalidateAuthSession.mockImplementationOnce(
      () =>
        new Promise<AuthState>((resolve) => {
          resolveFocusValidation = resolve;
        }),
    );

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });

    expect(revalidateAuthSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Mounted 1");
    expect(container.textContent).toContain("Verifying your session");
    expect(mountCount).toBe(1);

    await act(async () => {
      resolveFocusValidation?.(authenticatedState);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Mounted 1");
    expect(container.textContent).not.toContain("Verifying your session");
    expect(mountCount).toBe(1);
  });

  it("still revalidates when the protected pathname changes", async () => {
    renderGuard("/people");

    await waitFor(() => container.textContent?.includes("Mounted 1") === true);
    expect(revalidateAuthSession).toHaveBeenCalledTimes(0);

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();
    await act(async () => {
      button?.click();
    });

    await waitFor(() => revalidateAuthSession.mock.calls.length === 1);
    await waitFor(() =>
      container.textContent?.includes("Location /expenses") === true,
    );

    expect(mountCount).toBe(2);
  });
});

function renderGuard(initialEntry: string, strictMode = false) {
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <RequireAuth>
            <StatefulPage />
          </RequireAuth>
        ),
      },
    ],
    { initialEntries: [initialEntry] },
  );

  root = createRoot(container);
  act(() => {
    const app = <RouterProvider router={router} />;
    root?.render(strictMode ? <StrictMode>{app}</StrictMode> : app);
  });
}

function StatefulPage() {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    mountCount += 1;
  }, []);

  const queryOnlyNavigation = location.pathname === "/people" && location.search;

  return (
    <section>
      <p>Mounted {mountCount + 1}</p>
      <p>
        Location {location.pathname}
        {location.search}
      </p>
      <button
        type="button"
        onClick={() =>
          navigate(queryOnlyNavigation ? "/people?view=list" : "/expenses")
        }
      >
        Navigate
      </button>
    </section>
  );
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
