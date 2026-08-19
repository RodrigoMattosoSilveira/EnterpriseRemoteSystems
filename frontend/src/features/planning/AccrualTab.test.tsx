import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccrualTab } from "./AccrualTab";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import type { AuthzCurrentActor } from "../../types/authz";
import type { WorkPeriod } from "../../types/planning";
import type { ReferenceDataItem } from "../../types/referenceData";

const period: WorkPeriod = {
  id: "wp-1",
  tenantId: "default",
  workDate: "2026-06-07",
  periodCode: "DAY",
  name: "06:00-18:00",
  startsAt: "2026-06-07T06:00:00Z",
  endsAt: "2026-06-07T18:00:00Z",
  status: "ACCRUAL_OPEN",
  createdAt: "2026-06-07T00:00:00Z",
  updatedAt: "2026-06-07T00:00:00Z",
};
const locations: ReferenceDataItem[] = [
  {
    id: "well-1",
    tenantId: "default",
    type: "location",
    code: "WELL_1",
    label: "Well 1",
    description: "",
    active: true,
    sortOrder: 1,
  },
];
let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("AccrualTab", () => {
  it("shows production, run controls, and pending accrual items", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("gold-production-entries"))
          return response({ items: [], total: 0, page: 1, pageSize: 100 });
        if (url.includes("/work-periods/wp-1/accrual-runs"))
          return response({
            items: [
              {
                id: "run-1",
                tenantId: "default",
                workPeriodId: "wp-1",
                status: "PENDING_INPUT",
                accrualDate: "2026-06-07",
                summary: {
                  totalItems: 1,
                  readyItems: 0,
                  pendingItems: 1,
                  skippedItems: 0,
                  postedItems: 0,
                },
                createdAt: "x",
                updatedAt: "x",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 100,
          });
        if (url.includes("/accrual-runs/run-1/items"))
          return response({
            items: [
              {
                id: "item-1",
                tenantId: "default",
                accrualRunId: "run-1",
                workPeriodId: "wp-1",
                collaboratorId: "c-1",
                collaboratorName: "Maria",
                calculationType: "GOLD_COMMISSION",
                direction: "CREDIT",
                status: "PENDING",
                pendingReason: "GOLD_PRODUCTION_MISSING",
                createdAt: "x",
                updatedAt: "x",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 500,
          });
        throw new Error(`Unhandled request ${url}`);
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <AuthorizationProvider value={actorWithPermissions(["gold_production.manage"])}>
              <AccrualTab workPeriod={period} locations={locations} />
            </AuthorizationProvider>
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });
    await waitForText("Gold Production Missing");
    expect(container.textContent).toContain(
      "Gold Produced is read-only in Accrual",
    );
    expect(container.textContent).toContain("Open Gold Production");
    expect(container.textContent).not.toContain("Add Production");
    expect(container.textContent).toContain("Run Accrual");
    expect(container.textContent).toContain("Maria");
  });

  it("shows posted accrual items as visible in Current Account earnings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("gold-production-entries"))
          return response({ items: [], total: 0, page: 1, pageSize: 100 });
        if (url.includes("/work-periods/wp-1/accrual-runs"))
          return response({
            items: [
              {
                id: "run-posted-1",
                tenantId: "default",
                workPeriodId: "wp-1",
                status: "POSTED",
                accrualDate: "2026-06-07",
                summary: {
                  totalItems: 1,
                  readyItems: 0,
                  pendingItems: 0,
                  skippedItems: 0,
                  postedItems: 1,
                },
                createdAt: "x",
                updatedAt: "x",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 100,
          });
        if (url.includes("/accrual-runs/run-posted-1/items"))
          return response({
            items: [
              {
                id: "item-posted-1",
                tenantId: "default",
                accrualRunId: "run-posted-1",
                workPeriodId: "wp-1",
                workPeriodAssignmentId: "assign-1",
                collaboratorId: "collab-1",
                collaboratorName: "Maria",
                calculationType: "DAILY_BRL",
                direction: "CREDIT",
                brlAmount: 150,
                status: "POSTED",
                createdAt: "x",
                updatedAt: "x",
              },
            ],
            total: 1,
            page: 1,
            pageSize: 500,
          });
        throw new Error(`Unhandled request ${url}`);
      }),
    );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <AuthorizationProvider value={actorWithPermissions(["earnings.read"])}>
              <AccrualTab workPeriod={period} locations={locations} />
            </AuthorizationProvider>
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });

    await waitForText("Posted items are now visible in Current Accounts.");
    await waitForText("Posted earning credit");
    await waitForText("View in Current Account");
    expect(container.textContent).not.toContain("Open Gold Production");

    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/collaborators/collab-1/current-account?filter=earnings"]',
    );
    expect(link).not.toBeNull();
  });
});

function actorWithPermissions(permissions: string[]): AuthzCurrentActor {
  return {
    actorKey: "test-actor",
    actorRecordId: "test-actor-id",
    tenantId: "default",
    scope: "TENANT",
    roleCodes: [],
    permissions,
    intrinsicPermissions: [],
    delegatedPermissions: permissions,
  };
}

function response(data: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify({ data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}
async function waitForText(text: string) {
  for (let i = 0; i < 40; i += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  throw new Error(`Missing text: ${text}`);
}
