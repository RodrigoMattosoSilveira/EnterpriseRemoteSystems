import { loadRecentReauthentication } from "../app/reauthStore";
import { apiFetch } from "./client";
import type { FinancialProjection } from "../types/financialProjection";
import type { Person } from "../types/people";
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
  UpdateCollaboratorInput,
} from "../types/collaborators";

export function listCollaboratorCandidates(): Promise<Person[]> {
  return apiFetch<Person[]>("/collaborators/candidates");
}

const expenseCollaboratorPageSize = 100;

export async function listAllCollaborators(): Promise<Collaborator[]> {
  const items: Collaborator[] = [];

  for (let page = 1; ; page += 1) {
    const result = await listCollaborators({
      page,
      pageSize: expenseCollaboratorPageSize,
    });
    items.push(...result.items);

    if (items.length >= result.total || result.items.length === 0) {
      return items;
    }
  }
}

export function listExpenseCollaborators(): Promise<Collaborator[]> {
  return listAllCollaborators();
}

export async function listCollaborators(
  filter: CollaboratorListFilter = {},
): Promise<CollaboratorListResponse> {
  const searchParams = new URLSearchParams();

  if (filter.search) {
    searchParams.set("search", filter.search);
  }
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

export function updateCollaborator(
  id: string,
  input: UpdateCollaboratorInput,
): Promise<Collaborator> {
  return apiFetch<Collaborator>(`/collaborators/${encodeURIComponent(id)}`, {
    method: "PUT",
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
      headers: recentReauthenticationHeaders(),
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
      headers: recentReauthenticationHeaders(),
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
      headers: recentReauthenticationHeaders(),
      body: JSON.stringify(input),
    },
  );
}

function recentReauthenticationHeaders(): Record<string, string> {
  const recent = loadRecentReauthentication();
  if (!recent) return {};

  return {
    "X-Reauthenticated-At": recent.reauthenticatedAt,
    "X-Reauthentication-Method": recent.method,
  };
}
