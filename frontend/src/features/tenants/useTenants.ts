import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignTenantAdmin,
  createTenant,
  getTenant,
  listTenantAdminCandidates,
  listTenants,
  revokeTenantAdmin,
  setTenantActive,
  updateTenant,
} from "../../api/tenants.api";
import type { CreateTenantInput, UpdateTenantInput } from "../../types/tenants";

const tenantsKey = ["tenants"] as const;

export function useTenants() {
  return useQuery({ queryKey: tenantsKey, queryFn: listTenants });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: [...tenantsKey, id],
    queryFn: () => getTenant(id),
    enabled: Boolean(id),
  });
}

export function useTenantAdminCandidates(id: string) {
  return useQuery({
    queryKey: [...tenantsKey, id, "admin-candidates"],
    queryFn: () => listTenantAdminCandidates(id),
    enabled: Boolean(id),
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantInput) => createTenant(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tenantsKey }),
  });
}

export function useUpdateTenant(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTenantInput) => updateTenant(id, input),
    onSuccess: (tenant) => {
      queryClient.setQueryData([...tenantsKey, id], tenant);
      queryClient.invalidateQueries({ queryKey: tenantsKey });
    },
  });
}

export function useSetTenantActive(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (active: boolean) => setTenantActive(id, active),
    onSuccess: (tenant) => {
      queryClient.setQueryData([...tenantsKey, id], tenant);
      queryClient.invalidateQueries({ queryKey: tenantsKey });
    },
  });
}

export function useAssignTenantAdmin(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actorId: string) => assignTenantAdmin(id, actorId),
    onSuccess: (tenant) => {
      queryClient.setQueryData([...tenantsKey, id], tenant);
      queryClient.invalidateQueries({ queryKey: tenantsKey });
      queryClient.invalidateQueries({ queryKey: [...tenantsKey, id, "admin-candidates"] });
    },
  });
}

export function useRevokeTenantAdmin(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actorId: string) => revokeTenantAdmin(id, actorId),
    onSuccess: (tenant) => {
      queryClient.setQueryData([...tenantsKey, id], tenant);
      queryClient.invalidateQueries({ queryKey: tenantsKey });
      queryClient.invalidateQueries({ queryKey: [...tenantsKey, id, "admin-candidates"] });
    },
  });
}
