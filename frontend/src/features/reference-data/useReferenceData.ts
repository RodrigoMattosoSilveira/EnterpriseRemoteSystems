import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createReferenceDataItem,
  deactivateReferenceDataItem,
  listReferenceDataByType,
  reactivateReferenceDataItem,
  updateReferenceDataItem,
} from "../../api/referenceData.api";
import type { ReferenceDataInput } from "../../types/referenceData";

export function useReferenceDataByType(type: string, enabled = true) {
  return useQuery({
    queryKey: ["reference-data", type],
    queryFn: () => listReferenceDataByType(type),
    enabled: Boolean(type) && enabled,
  });
}

export function useCreateReferenceDataItem(type: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReferenceDataInput) => createReferenceDataItem(type, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reference-data", type] });
    },
  });
}

export function useUpdateReferenceDataItem(type: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ReferenceDataInput }) =>
      updateReferenceDataItem(type, id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reference-data", type] });
    },
  });
}

export function useDeactivateReferenceDataItem(type: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateReferenceDataItem(type, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reference-data", type] });
    },
  });
}

export function useReactivateReferenceDataItem(type: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reactivateReferenceDataItem(type, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reference-data", type] });
    },
  });
}
