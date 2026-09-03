import { apiFetch } from "./client";
import type {
  CreateTenantInput,
  Tenant,
  TenantAdminCandidate,
  UpdateTenantInput,
} from "../types/tenants";

export function listTenants(): Promise<Tenant[]> {
  return apiFetch<Tenant[]>("/tenants");
}

export function getTenant(id: string): Promise<Tenant> {
  return apiFetch<Tenant>(`/tenants/${encodeURIComponent(id)}`);
}

export function createTenant(input: CreateTenantInput): Promise<Tenant> {
  return apiFetch<Tenant>("/tenants", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateTenant(id: string, input: UpdateTenantInput): Promise<Tenant> {
  return apiFetch<Tenant>(`/tenants/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function setTenantActive(id: string, active: boolean): Promise<Tenant> {
  return apiFetch<Tenant>(`/tenants/${encodeURIComponent(id)}/active`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}

export function listTenantAdminCandidates(id: string): Promise<TenantAdminCandidate[]> {
  return apiFetch<unknown>(
    `/tenants/${encodeURIComponent(id)}/admin-candidates`,
  ).then(normalizeTenantAdminCandidates);
}

export function normalizeTenantAdminCandidates(input: unknown): TenantAdminCandidate[] {
  let rows: unknown = input;

  if (!Array.isArray(rows) && rows && typeof rows === "object") {
    const record = rows as Record<string, unknown>;
    if (Array.isArray(record.data)) {
      rows = record.data;
    } else if (Array.isArray(record.items)) {
      rows = record.items;
    } else if (Array.isArray(record.candidates)) {
      rows = record.candidates;
    }
  }

  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.filter((row): row is TenantAdminCandidate => {
    if (!row || typeof row !== "object") {
      return false;
    }
    const candidate = row as Record<string, unknown>;
    return (
      typeof candidate.actorId === "string" &&
      typeof candidate.actorKey === "string" &&
      typeof candidate.active === "boolean" &&
      typeof candidate.assigned === "boolean"
    );
  });
}

export function assignTenantAdmin(id: string, actorId: string): Promise<Tenant> {
  return apiFetch<Tenant>(`/tenants/${encodeURIComponent(id)}/admins`, {
    method: "POST",
    body: JSON.stringify({ actorId }),
  });
}

export function revokeTenantAdmin(id: string, actorId: string): Promise<Tenant> {
  return apiFetch<Tenant>(
    `/tenants/${encodeURIComponent(id)}/admins/${encodeURIComponent(actorId)}`,
    { method: "DELETE" },
  );
}
