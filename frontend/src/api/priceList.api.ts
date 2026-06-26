import { apiFetch } from "./client";
import type { PriceListItem, PriceListItemListFilter } from "../types/priceList";

export async function listPriceListItems(
  filter: PriceListItemListFilter = {},
): Promise<PriceListItem[]> {
  const searchParams = new URLSearchParams();

  if (filter.itemType) {
    searchParams.set("itemType", filter.itemType);
  }
  if (filter.includeInactive) {
    searchParams.set("includeInactive", "true");
  }

  const query = searchParams.toString();
  return apiFetch<PriceListItem[]>(`/price-list-items${query ? `?${query}` : ""}`);
}
