import { apiFetch } from "./client";
import type { FinancialProjection } from "../types/financialProjection";
import type {
  CloseJourneyInput,
  CloseJourneyResult,
  PartialPayoutInput,
  PartialPayoutResult,
  SettlementPreview,
  ZeroGoldInput,
  ZeroGoldResult,
} from "../types/settlements";

import type {
  Collaborator,
  CollaboratorListFilter,
  CollaboratorListResponse,
  CreateCollaboratorInput,
} from "../types/collaborators";

export async function listCollaborators(
  filter: CollaboratorListFilter = {},
): Promise<CollaboratorListResponse> {
  const searchParams = new URLSearchParams();

  if (filter.statusId) {
    searchParams.set("statusId", filter.statusId);
  }
  if (filter.locationId) {
    searchParams.set("locationId", filter.locationId);
  }
  if (filter.paymentMethodId) {
    searchParams.set("paymentMethodId", filter.paymentMethodId);
  }
  if (filter.page !== undefined) {
    searchParams.set("page", String(filter.page));
  }
  if (filter.pageSize !== undefined) {
    searchParams.set("pageSize", String(filter.pageSize));
  }

  const query = searchParams.toString();
  const response = await apiFetch<CollaboratorListResponse | Collaborator[]>(
    `/collaborators${query ? `?${query}` : ""}`,
  );

  if (Array.isArray(response)) {
    return { items: response, total: response.length };
  }

  return {
    items: response.items ?? [],
    total: response.total ?? 0,
  };
}

export function getCollaborator(id: string): Promise<Collaborator> {
  return apiFetch<Collaborator>(`/collaborators/${encodeURIComponent(id)}`);
}

export function createCollaborator(
  input: CreateCollaboratorInput,
): Promise<Collaborator> {
  return apiFetch<Collaborator>("/collaborators", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function getCollaboratorFinancialProjection(
  collaboratorId: string,
): Promise<FinancialProjection> {
  return apiFetch<FinancialProjection>(
    `/collaborators/${encodeURIComponent(collaboratorId)}/financial-projection`,
  );
}

export function getSettlementPreview(
  collaboratorId: string,
): Promise<SettlementPreview> {
  return apiFetch<SettlementPreview>(
    `/collaborators/${encodeURIComponent(collaboratorId)}/settlement-preview`,
  );
}

export function zeroGold(
  collaboratorId: string,
  input: ZeroGoldInput,
): Promise<ZeroGoldResult> {
  return apiFetch<ZeroGoldResult>(
    `/collaborators/${encodeURIComponent(collaboratorId)}/zero-gold`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function partialPayout(
  collaboratorId: string,
  input: PartialPayoutInput,
): Promise<PartialPayoutResult> {
  return apiFetch<PartialPayoutResult>(
    `/collaborators/${encodeURIComponent(collaboratorId)}/payout`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function closeJourney(
  collaboratorId: string,
  input: CloseJourneyInput,
): Promise<CloseJourneyResult> {
  return apiFetch<CloseJourneyResult>(
    `/collaborators/${encodeURIComponent(collaboratorId)}/close`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}
