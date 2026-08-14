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
  return apiFetch<TenantAdminCandidate[]>(
    `/tenants/${encodeURIComponent(id)}/admin-candidates`,
  );
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
