import { apiFetch } from "./client";
import type {
  AccrualItemListResponse,
  AccrualRun,
  AccrualRunListResponse,
  CreateAccrualRunInput,
  CreateGoldProductionEntryInput,
  GoldProductionEntry,
  GoldProductionEntryListResponse,
  UpdateGoldProductionEntryInput,
} from "../types/accruals";

export function listAccrualRuns(
  workPeriodId: string,
): Promise<AccrualRunListResponse> {
  return apiFetch<AccrualRunListResponse>(
    `/work-periods/${encodeURIComponent(workPeriodId)}/accrual-runs?pageSize=100`,
  );
}

export function createAccrualRun(
  workPeriodId: string,
  input: CreateAccrualRunInput,
): Promise<AccrualRun> {
  return apiFetch<AccrualRun>(
    `/work-periods/${encodeURIComponent(workPeriodId)}/accrual-runs`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function recalculateAccrualRun(runId: string): Promise<AccrualRun> {
  return apiFetch<AccrualRun>(
    `/accrual-runs/${encodeURIComponent(runId)}/recalculate`,
    {
      method: "POST",
    },
  );
}

export function postAccrualRun(runId: string): Promise<AccrualRun> {
  return apiFetch<AccrualRun>(
    `/accrual-runs/${encodeURIComponent(runId)}/post`,
    {
      method: "POST",
    },
  );
}

export function listAccrualItems(
  runId: string,
): Promise<AccrualItemListResponse> {
  return apiFetch<AccrualItemListResponse>(
    `/accrual-runs/${encodeURIComponent(runId)}/items?pageSize=500`,
  );
}

export function listGoldProductionEntries(
  workPeriodId: string,
): Promise<GoldProductionEntryListResponse> {
  return apiFetch<GoldProductionEntryListResponse>(
    `/work-periods/${encodeURIComponent(workPeriodId)}/gold-production-entries?pageSize=100`,
  );
}

export function createGoldProductionEntry(
  workPeriodId: string,
  input: CreateGoldProductionEntryInput,
): Promise<GoldProductionEntry> {
  return apiFetch<GoldProductionEntry>(
    `/work-periods/${encodeURIComponent(workPeriodId)}/gold-production-entries`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function updateGoldProductionEntry(
  entryId: string,
  input: UpdateGoldProductionEntryInput,
): Promise<GoldProductionEntry> {
  return apiFetch<GoldProductionEntry>(
    `/gold-production-entries/${encodeURIComponent(entryId)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}
