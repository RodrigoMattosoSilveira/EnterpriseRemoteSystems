import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkPeriodDetailPage } from "./WorkPeriodDetailPage";

vi.mock("../../app/useAuth", () => ({
  useAuthState: () => ({
    status: "authenticated",
    session: {
      accountId: "account-1",
      displayName: "Operator D",
      login: "operator@example.test",
      mustChangePassword: false,
      expiresAt: "2026-08-30T00:00:00Z",
    },
    error: null,
    reason: null,
  }),
}));

vi.mock("../../api/auth.api", () => ({
  loadAuthTenantOptions: async () => [
    {
      id: "default",
      code: "DEFAULT",
      name: "Default Tenant",
      roleCodes: ["TENANT_ADMIN"],
    },
  ],
}));

vi.mock("../reference-data/useReferenceData", () => ({
  useReferenceDataByType: () => ({
    data: [],
    error: null,
    isLoading: false,
  }),
}));

vi.mock("./PlanTab", () => ({ PlanTab: () => null }));
vi.mock("./InformTab", () => ({ InformTab: () => null }));
vi.mock("./AccrualTab", () => ({ AccrualTab: () => null }));

const period = {
  id: "manual30g-work-period-tenant-b",
  tenantId: "default",
  workDate: "2026-08-28",
  periodCode: "MANUAL30G_B",
  name: "30G Tenant B accrual regression",
  startsAt: "2026-08-28T06:00:00Z",
  endsAt: "2026-08-28T18:00:00Z",
  status: "ACCRUAL_OPEN" as const,
  createdAt: "2026-08-28T00:00:00Z",
  updatedAt: "2026-08-28T00:00:00Z",
};

vi.mock("./usePlanning", () => ({
  useWorkPeriod: () => ({ data: period, error: null, isLoading: false }),
  useAssignments: () => ({
    data: { items: [], total: 0, page: 1, pageSize: 100 },
    error: null,
    isLoading: false,
  }),
  usePlanningTemplate: () => ({ data: undefined, error: null, isLoading: false }),
  useWorkPlanRoster: () => ({ data: undefined, error: null, isLoading: false }),
  useBulkPlanAssignments: () => ({
    error: null,
    isPending: false,
    mutate: vi.fn(),
  }),
  useRefinePlanAssignment: () => ({
    error: null,
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useMarkOutcome: () => ({ error: null, isPending: false, mutate: vi.fn() }),
  useInformWorkPeriod: () => ({ error: null, isPending: false, mutate: vi.fn() }),
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  vi.clearAllMocks();
});

describe("WorkPeriodDetailPage", () => {
  it("shows a user-friendly Work Period header with tenant, date, name, and codes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [
        {
          path: "/work-periods/:id",
          element: (
            <QueryClientProvider client={queryClient}>
              <WorkPeriodDetailPage />
            </QueryClientProvider>
          ),
        },
      ],
      { initialEntries: ["/work-periods/manual30g-work-period-tenant-b"] },
    );

    await act(async () => {
      root = createRoot(container);
      root.render(<RouterProvider router={router} />);
    });

    await waitForText("Default Tenant · 2026-08-28 · 30G Tenant B accrual regression");

    const pageHeading = headingByText("h1", "Work Period");
    const workPeriodHeading = headingByText(
      "h2",
      "Default Tenant · 2026-08-28 · 30G Tenant B accrual regression",
    );

    expect(pageHeading).toBeTruthy();
    expect(pageHeading?.className).toContain("text-3xl");
    expect(workPeriodHeading).toBeTruthy();
    expect(workPeriodHeading?.className).toContain("text-lg");
    expect(container.textContent).toContain("Work Period Code: MANUAL30G_B");
    expect(container.textContent).toContain(
      "Work Period ID: manual30g-work-period-tenant-b",
    );
    expect(container.textContent).toContain("Schedule:");
  });
});

async function waitForText(text: string) {
  for (let index = 0; index < 40; index += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Timed out waiting for text: ${text}`);
}

function headingByText(tag: "h1" | "h2", text: string): HTMLElement | null {
  return (
    Array.from(container.querySelectorAll<HTMLElement>(tag)).find(
      (element) => element.textContent?.trim() === text,
    ) ?? null
  );
}
