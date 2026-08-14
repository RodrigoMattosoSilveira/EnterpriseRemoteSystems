import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCollaborator,
  getCollaborator,
  listAllCollaborators,
  listCollaboratorCandidates,
  listCollaborators,
  listExpenseCollaborators,
  updateCollaborator,
} from "../../api/collaborators.api";
import type {
  Collaborator,
  CollaboratorListFilter,
  CreateCollaboratorInput,
  UpdateCollaboratorInput,
} from "../../types/collaborators";

export const collaboratorQueryKeys = {
  all: ["collaborators"] as const,
  lists: () => [...collaboratorQueryKeys.all, "list"] as const,
  list: (filter: CollaboratorListFilter = {}) =>
    [...collaboratorQueryKeys.lists(), filter] as const,
  catalog: () => [...collaboratorQueryKeys.lists(), "catalog"] as const,
  search: (search: string) =>
    [...collaboratorQueryKeys.lists(), "search", search] as const,
  candidates: () => [...collaboratorQueryKeys.all, "candidates"] as const,
  expenseCandidates: () =>
    [...collaboratorQueryKeys.lists(), "expense-candidates"] as const,
  details: () => [...collaboratorQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...collaboratorQueryKeys.details(), id] as const,
};

export function useCollaboratorCandidates() {
  return useQuery({
    queryKey: collaboratorQueryKeys.candidates(),
    queryFn: listCollaboratorCandidates,
  });
}

export function useCollaborators(filter: CollaboratorListFilter = {}) {
  return useQuery({
    queryKey: collaboratorQueryKeys.list(filter),
    queryFn: () => listCollaborators(filter),
  });
}

export function useCollaboratorCatalog(enabled = true) {
  return useQuery({
    queryKey: collaboratorQueryKeys.catalog(),
    queryFn: listAllCollaborators,
    enabled,
  });
}

export function useCollaboratorSearch(
  search: string,
  refetchOnWindowFocus = true,
) {
  const normalizedSearch = search.trim();

  return useQuery({
    queryKey: collaboratorQueryKeys.search(normalizedSearch),
    queryFn: () =>
      listCollaborators({
        search: normalizedSearch,
        page: 1,
        pageSize: 25,
      }),
    enabled: normalizedSearch.length > 0,
    refetchOnWindowFocus,
  });
}

export function useExpenseCollaborators() {
  return useQuery({
    queryKey: collaboratorQueryKeys.expenseCandidates(),
    queryFn: listExpenseCollaborators,
  });
}

export function useCollaborator(id: string) {
  return useQuery({
    queryKey: collaboratorQueryKeys.detail(id),
    queryFn: () => getCollaborator(id),
    enabled: Boolean(id),
  });
}

export function useCreateCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCollaboratorInput) => createCollaborator(input),
    onSuccess: (collaborator) => {
      queryClient.invalidateQueries({
        queryKey: collaboratorQueryKeys.lists(),
      });
      queryClient.invalidateQueries({
        queryKey: collaboratorQueryKeys.candidates(),
      });
      queryClient.setQueryData(
        collaboratorQueryKeys.catalog(),
        (current: Collaborator[] | undefined) =>
          mergeCollaboratorIntoCatalog(current, collaborator),
      );
      queryClient.setQueryData(
        collaboratorQueryKeys.detail(collaborator.id),
        collaborator,
      );
    },
  });
}

export function useUpdateCollaborator(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateCollaboratorInput) =>
      updateCollaborator(id, input),
    onSuccess: (collaborator) => {
      queryClient.invalidateQueries({
        queryKey: collaboratorQueryKeys.lists(),
      });
      queryClient.setQueryData(
        collaboratorQueryKeys.detail(collaborator.id),
        collaborator,
      );
    },
  });
}

function mergeCollaboratorIntoCatalog(
  current: Collaborator[] | undefined,
  collaborator: Collaborator,
) {
  return [
    collaborator,
    ...(current ?? []).filter((item) => item.id !== collaborator.id),
  ];
}
