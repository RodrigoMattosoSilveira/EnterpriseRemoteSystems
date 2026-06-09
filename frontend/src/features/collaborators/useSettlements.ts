import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closeJourney,
  getSettlementPreview,
  partialPayout,
  zeroGold,
} from "../../api/collaborators.api";
import type {
  CloseJourneyInput,
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

export function useCloseJourney(collaboratorId: string) {
  return useSettlementMutation(collaboratorId, (input: CloseJourneyInput) =>
    closeJourney(collaboratorId, input),
  );
}

function useSettlementMutation<TInput, TResult>(
  collaboratorId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: settlementQueryKeys.preview(collaboratorId),
        }),
        queryClient.invalidateQueries({
          queryKey: collaboratorQueryKeys.detail(collaboratorId),
        }),
      ]);
    },
  });
}
