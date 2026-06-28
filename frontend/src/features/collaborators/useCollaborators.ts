import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCollaborator,
  getCollaborator,
  listCollaborators,
  updateCollaborator,
} from "../../api/collaborators.api";
import type {
  CollaboratorListFilter,
  CreateCollaboratorInput,
  UpdateCollaboratorInput,
} from "../../types/collaborators";

export const collaboratorQueryKeys = {
  all: ["collaborators"] as const,
  lists: () => [...collaboratorQueryKeys.all, "list"] as const,
  list: (filter: CollaboratorListFilter = {}) =>
    [...collaboratorQueryKeys.lists(), filter] as const,
  details: () => [...collaboratorQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...collaboratorQueryKeys.details(), id] as const,
};

export function useCollaborators(filter: CollaboratorListFilter = {}) {
  return useQuery({
    queryKey: collaboratorQueryKeys.list(filter),
    queryFn: () => listCollaborators(filter),
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
