import { useQuery } from "@tanstack/react-query";
import { getCollaboratorFinancialProjection } from "../../api/collaborators.api";

export function useFinancialProjection(collaboratorId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["collaborators", "financial-projection", collaboratorId],
    queryFn: () => getCollaboratorFinancialProjection(collaboratorId),
    enabled: enabled && Boolean(collaboratorId),
  });
}
