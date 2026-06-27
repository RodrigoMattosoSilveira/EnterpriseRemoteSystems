import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPriceListItem,
  deactivatePriceListItem,
  listPriceListItems,
  reactivatePriceListItem,
  updatePriceListItem,
} from "../../api/priceList.api";
import type { PriceListItemInput, PriceListItemListFilter } from "../../types/priceList";

export const priceListQueryKeys = {
  all: ["price-list-items"] as const,
  lists: () => [...priceListQueryKeys.all, "list"] as const,
  list: (filter: PriceListItemListFilter = {}) =>
    [...priceListQueryKeys.lists(), filter] as const,
};

export function usePriceListItems(filter: PriceListItemListFilter = {}) {
  return useQuery({
    queryKey: priceListQueryKeys.list(filter),
    queryFn: () => listPriceListItems(filter),
  });
}

export function useCreatePriceListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PriceListItemInput) => createPriceListItem(normalizePriceListItemInput(input)),
    onSuccess: () => invalidatePriceLists(queryClient),
  });
}

export function useUpdatePriceListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PriceListItemInput }) =>
      updatePriceListItem(id, normalizePriceListItemInput(input)),
    onSuccess: () => invalidatePriceLists(queryClient),
  });
}

export function useDeactivatePriceListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivatePriceListItem(id),
    onSuccess: () => invalidatePriceLists(queryClient),
  });
}

export function useReactivatePriceListItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => reactivatePriceListItem(id),
    onSuccess: () => invalidatePriceLists(queryClient),
  });
}

function invalidatePriceLists(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: priceListQueryKeys.all });
}

function normalizePriceListItemInput(input: PriceListItemInput): PriceListItemInput {
  return {
    itemType: input.itemType,
    code: input.code.trim(),
    description: input.description.trim(),
    unitPriceBrl: input.unitPriceBrl,
    sortOrder: input.sortOrder,
  };
}
