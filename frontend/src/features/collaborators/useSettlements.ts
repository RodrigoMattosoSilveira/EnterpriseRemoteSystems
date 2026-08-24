import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closeJourney,
  finalCollaboratorPayment,
  finalTenantPayment,
  getSettlementPreview,
  partialPayout,
  zeroGold,
} from "../../api/collaborators.api";
import type {
  CloseJourneyInput,
  CloseJourneyResult,
  FinalSettlementInput,
  PartialPayoutInput,
  ZeroGoldInput,
} from "../../types/settlements";
import { collaboratorQueryKeys } from "./useCollaborators";

export const settlementQueryKeys = {
  all: ["settlements"] as const,
  preview: (collaboratorId: string) =>
    [...settlementQueryKeys.all, "preview", collaboratorId] as const,
};

export function useSettlementPreview(collaboratorId: string) {
  return useQuery({
    queryKey: settlementQueryKeys.preview(collaboratorId),
    queryFn: () => getSettlementPreview(collaboratorId),
    enabled: Boolean(collaboratorId),
  });
}

export function useZeroGold(collaboratorId: string) {
  return useSettlementMutation(collaboratorId, (input: ZeroGoldInput) =>
    zeroGold(collaboratorId, input),
  );
}

export function usePartialPayout(collaboratorId: string) {
  return useSettlementMutation(collaboratorId, (input: PartialPayoutInput) =>
    partialPayout(collaboratorId, input),
  );
}

export function useFinalTenantPayment(collaboratorId: string) {
  return useSettlementMutation(collaboratorId, (input: FinalSettlementInput) =>
    finalTenantPayment(collaboratorId, input),
  );
}

export function useFinalCollaboratorPayment(collaboratorId: string) {
  return useSettlementMutation(collaboratorId, (input: FinalSettlementInput) =>
    finalCollaboratorPayment(collaboratorId, input),
  );
}

export function useCloseJourney(
  collaboratorId: string,
  onJourneyClosed?: (result: CloseJourneyResult) => void,
) {
  return useSettlementMutation(
    collaboratorId,
    (input: CloseJourneyInput) => closeJourney(collaboratorId, input),
    onJourneyClosed,
  );
}

function useSettlementMutation<TInput, TResult>(
  collaboratorId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
  onSuccessBeforeInvalidate?: (result: TResult) => void,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async (result) => {
      onSuccessBeforeInvalidate?.(result);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: settlementQueryKeys.preview(collaboratorId),
        }),
        queryClient.invalidateQueries({
          queryKey: collaboratorQueryKeys.detail(collaboratorId),
        }),
        queryClient.invalidateQueries({
          queryKey: collaboratorQueryKeys.lists(),
        }),
      ]);
    },
  });
}
