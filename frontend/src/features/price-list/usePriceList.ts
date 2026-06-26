import { useQuery } from "@tanstack/react-query";
import { listPriceListItems } from "../../api/priceList.api";
import type { PriceListItemListFilter } from "../../types/priceList";

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
