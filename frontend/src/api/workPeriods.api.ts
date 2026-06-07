import { apiFetch } from "./client";
import type {
  CreateWorkPeriodInput,
  WorkPeriod,
  WorkPeriodListFilter,
  WorkPeriodListResponse,
  WorkPlanRoster,
} from "../types/planning";

export async function listWorkPeriods(
  filter: WorkPeriodListFilter = {},
): Promise<WorkPeriodListResponse> {
  const params = new URLSearchParams();
  if (filter.dateFrom) params.set("dateFrom", filter.dateFrom);
  if (filter.dateTo) params.set("dateTo", filter.dateTo);
  if (filter.status) params.set("status", filter.status);
  if (filter.page !== undefined) params.set("page", String(filter.page));
  if (filter.pageSize !== undefined) params.set("pageSize", String(filter.pageSize));

  const query = params.toString();
  return apiFetch<WorkPeriodListResponse>(`/work-periods${query ? `?${query}` : ""}`);
}

export function getWorkPeriod(id: string): Promise<WorkPeriod> {
  return apiFetch<WorkPeriod>(`/work-periods/${encodeURIComponent(id)}`);
}

export function createWorkPeriod(input: CreateWorkPeriodInput): Promise<WorkPeriod> {
  return apiFetch<WorkPeriod>("/work-periods", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function informWorkPeriod(id: string): Promise<WorkPeriod> {
  return apiFetch<WorkPeriod>(`/work-periods/${encodeURIComponent(id)}/inform`, {
    method: "POST",
  });
}

export function getWorkPlanRoster(id: string): Promise<WorkPlanRoster> {
  return apiFetch<WorkPlanRoster>(`/work-periods/${encodeURIComponent(id)}/print-roster`);
}
