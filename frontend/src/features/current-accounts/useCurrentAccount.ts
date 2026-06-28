import { useQuery } from "@tanstack/react-query";
import { getCollaboratorCurrentAccount } from "../../api/currentAccounts.api";
import type { CurrentAccountFilter } from "../../types/currentAccounts";

export const currentAccountQueryKeys = {
  all: ["current-account"] as const,
  detail: (collaboratorId: string, filter: CurrentAccountFilter = {}) =>
    [...currentAccountQueryKeys.all, collaboratorId, filter] as const,
};

export function useCollaboratorCurrentAccount(
  collaboratorId: string,
  filter: CurrentAccountFilter = {},
) {
  return useQuery({
    queryKey: currentAccountQueryKeys.detail(collaboratorId, filter),
    queryFn: () => getCollaboratorCurrentAccount(collaboratorId, filter),
    enabled: Boolean(collaboratorId),
  });
}
