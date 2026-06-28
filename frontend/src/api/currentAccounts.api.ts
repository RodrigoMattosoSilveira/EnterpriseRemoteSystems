import { apiFetch } from "./client";
import type { AuthzAdminRequestActor } from "../types/authz";
import type {
  CurrentAccountDetail,
  CurrentAccountFilter,
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


export function getCollaboratorCurrentAccount(
  collaboratorId: string,
  filter: CurrentAccountFilter = {},
): Promise<CurrentAccountDetail> {
  const params = new URLSearchParams();
  if (filter.valueUnitId) params.set("valueUnitId", filter.valueUnitId);
  if (filter.entryType) params.set("entryType", filter.entryType);
  if (filter.direction) params.set("direction", filter.direction);
  if (filter.sourceType) params.set("sourceType", filter.sourceType);
  if (filter.outstandingReceipts) params.set("outstandingReceipts", "true");
  if (filter.includeInactive) params.set("includeInactive", "true");
  if (filter.page) params.set("page", String(filter.page));
  if (filter.pageSize) params.set("pageSize", String(filter.pageSize));

  const query = params.toString();
  return apiFetch<CurrentAccountDetail>(
    `/collaborators/${encodeURIComponent(collaboratorId)}/current-account${query ? `?${query}` : ""}`,
  );
}
