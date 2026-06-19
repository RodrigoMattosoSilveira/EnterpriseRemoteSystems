import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSecondPersonApprovalPolicy,
  updateSecondPersonApprovalPolicy,
} from "../../api/currentAccounts.api";
import type { AuthzAdminRequestActor } from "../../types/authz";
import type { UpdateSecondPersonApprovalPolicyInput } from "../../types/currentAccounts";

function enabled(actor: AuthzAdminRequestActor) {
  return Boolean(actor.actorId.trim() && actor.tenantId.trim());
}

function secondPersonApprovalPolicyQueryKey(actor: AuthzAdminRequestActor) {
  return ["current-account-settings", "second-person-approval", actor.actorId, actor.tenantId] as const;
}

export function useSecondPersonApprovalPolicy(actor: AuthzAdminRequestActor) {
  return useQuery({
    queryKey: secondPersonApprovalPolicyQueryKey(actor),
    queryFn: () => getSecondPersonApprovalPolicy(actor),
    enabled: enabled(actor),
  });
}

export function useUpdateSecondPersonApprovalPolicy(actor: AuthzAdminRequestActor) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateSecondPersonApprovalPolicyInput) =>
      updateSecondPersonApprovalPolicy(actor, input),
    onSuccess: (policy) => {
      queryClient.setQueryData(secondPersonApprovalPolicyQueryKey(actor), policy);
    },
  });
}
