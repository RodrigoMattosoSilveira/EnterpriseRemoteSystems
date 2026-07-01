import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createGoldProductionEntry,
  updateGoldProductionEntry,
} from "../../api/accruals.api";
import type {
  CreateGoldProductionEntryInput,
  UpdateGoldProductionEntryInput,
} from "../../types/accruals";
import { accrualKeys } from "../planning/useAccruals";

export function useCreateMineProduction(workPeriodId: string) {
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

export function useUpdateMineProduction(workPeriodId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      entryId,
      input,
    }: {
      entryId: string;
      input: UpdateGoldProductionEntryInput;
    }) => updateGoldProductionEntry(entryId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: accrualKeys.production(workPeriodId),
      });
    },
  });
}
