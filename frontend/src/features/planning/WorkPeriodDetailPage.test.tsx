import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkPeriodDetailPage } from "./WorkPeriodDetailPage";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../i18n";
import type { WorkPeriod } from "../../types/planning";

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

vi.mock("./PlanTab", () => ({
  PlanTab: () => <div data-testid="plan-tab">Plan tab</div>,
}));
vi.mock("./InformTab", () => ({ InformTab: () => null }));
vi.mock("./AccrualTab", () => ({
  AccrualTab: () => <div data-testid="accrual-tab">Accrual tab</div>,
}));

const basePeriod: WorkPeriod = {
  id: "manual30g-work-period-tenant-b",
  tenantId: "default",
  workDate: "2026-08-28",
  periodCode: "MANUAL30G_B",
  name: "30G Tenant B accrual regression",
  startsAt: "2026-08-28T06:00:00Z",
  endsAt: "2026-08-28T18:00:00Z",
  status: "ACCRUAL_OPEN",
  createdAt: "2026-08-28T00:00:00Z",
  updatedAt: "2026-08-28T00:00:00Z",
};

let period: WorkPeriod = { ...basePeriod };

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
  period = { ...basePeriod };
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  localStorage.clear();
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
      root.render(<I18nProvider><RouterProvider router={router} /></I18nProvider>);
    });

    await waitForText("Default Tenant · Aug 28, 2026 · 30G Tenant B accrual regression");

    const pageHeading = headingByText("h1", "Work Period");
    const workPeriodHeading = headingByText(
      "h2",
      "Default Tenant · Aug 28, 2026 · 30G Tenant B accrual regression",
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

  it("opens a fully posted Work Period in the accrual view instead of planning", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    period = {
      ...basePeriod,
      workDate: "2026-09-16",
      periodCode: "DAY",
      name: "06:00-18:00",
      status: "FULLY_POSTED",
    };

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
      root.render(<I18nProvider><RouterProvider router={router} /></I18nProvider>);
    });

    await waitForText("Totalmente Lançado");

    const accrualButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Acúmulo",
    );
    const planButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Plano",
    );

    expect(accrualButton?.className).toContain("bg-gray-950");
    expect(planButton?.className).not.toContain("bg-gray-950");
    expect(container.querySelector('[data-testid="accrual-tab"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="plan-tab"]')).toBeNull();
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
