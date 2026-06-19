import { apiFetch } from "./client";
import type { AuthzAdminRequestActor } from "../types/authz";
import type {
  SecondPersonApprovalPolicy,
  UpdateSecondPersonApprovalPolicyInput,
} from "../types/currentAccounts";

function requestActorHeaders(actor: AuthzAdminRequestActor) {
  return {
    "X-Actor-ID": actor.actorId,
    "X-Tenant-ID": actor.tenantId,
  };
}

export function getSecondPersonApprovalPolicy(
  actor: AuthzAdminRequestActor,
): Promise<SecondPersonApprovalPolicy> {
  return apiFetch<SecondPersonApprovalPolicy>(
    "/current-accounts/settings/second-person-approval",
    {
      headers: requestActorHeaders(actor),
    },
  );
}

export function updateSecondPersonApprovalPolicy(
  actor: AuthzAdminRequestActor,
  input: UpdateSecondPersonApprovalPolicyInput,
): Promise<SecondPersonApprovalPolicy> {
  return apiFetch<SecondPersonApprovalPolicy>(
    "/current-accounts/settings/second-person-approval",
    {
      method: "PUT",
      headers: requestActorHeaders(actor),
      body: JSON.stringify(input),
    },
  );
}
