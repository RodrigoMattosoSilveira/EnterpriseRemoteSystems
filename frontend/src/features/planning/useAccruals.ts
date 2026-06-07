import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccrualRun,
  createGoldProductionEntry,
  listAccrualItems,
  listAccrualRuns,
  listGoldProductionEntries,
  postAccrualRun,
  recalculateAccrualRun,
} from "../../api/accruals.api";
import type {
  CreateAccrualRunInput,
  CreateGoldProductionEntryInput,
} from "../../types/accruals";
import { workPeriodKeys } from "./usePlanning";

export const accrualKeys = {
  runs: (workPeriodId: string) =>
    ["work-periods", workPeriodId, "accrual-runs"] as const,
  items: (runId: string) => ["accrual-runs", runId, "items"] as const,
  production: (workPeriodId: string) =>
    ["work-periods", workPeriodId, "gold-production"] as const,
};

export function useAccrualRuns(workPeriodId: string, enabled = true) {
  return useQuery({
    queryKey: accrualKeys.runs(workPeriodId),
    queryFn: () => listAccrualRuns(workPeriodId),
    enabled: Boolean(workPeriodId) && enabled,
  });
}

export function useAccrualItems(runId: string, enabled = true) {
  return useQuery({
    queryKey: accrualKeys.items(runId),
    queryFn: () => listAccrualItems(runId),
    enabled: Boolean(runId) && enabled,
  });
}

export function useGoldProductionEntries(workPeriodId: string, enabled = true) {
  return useQuery({
    queryKey: accrualKeys.production(workPeriodId),
    queryFn: () => listGoldProductionEntries(workPeriodId),
    enabled: Boolean(workPeriodId) && enabled,
  });
}

export function useCreateGoldProductionEntry(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoldProductionEntryInput) =>
      createGoldProductionEntry(workPeriodId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accrualKeys.production(workPeriodId),
      });
    },
  });
}

export function useCreateAccrualRun(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccrualRunInput) =>
      createAccrualRun(workPeriodId, input),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: accrualKeys.runs(workPeriodId),
      });
      queryClient.setQueryData(accrualKeys.items(run.id), undefined);
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.detail(workPeriodId),
      });
    },
  });
}

export function useRecalculateAccrualRun(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => recalculateAccrualRun(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: accrualKeys.runs(workPeriodId),
      });
      queryClient.invalidateQueries({ queryKey: accrualKeys.items(run.id) });
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.detail(workPeriodId),
      });
    },
  });
}

export function usePostAccrualRun(workPeriodId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => postAccrualRun(runId),
    onSuccess: (run) => {
      queryClient.invalidateQueries({
        queryKey: accrualKeys.runs(workPeriodId),
      });
      queryClient.invalidateQueries({ queryKey: accrualKeys.items(run.id) });
      queryClient.invalidateQueries({
        queryKey: workPeriodKeys.detail(workPeriodId),
      });
      queryClient.invalidateQueries({ queryKey: ["current-accounts"] });
    },
  });
}
