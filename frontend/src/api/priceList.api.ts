import { apiFetch } from "./client";
import type {
  PriceListItem,
  PriceListItemInput,
  PriceListItemListFilter,
} from "../types/priceList";

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

export function createPriceListItem(input: PriceListItemInput): Promise<PriceListItem> {
  return apiFetch<PriceListItem>("/price-list-items", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updatePriceListItem(
  id: string,
  input: PriceListItemInput,
): Promise<PriceListItem> {
  return apiFetch<PriceListItem>(`/price-list-items/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deactivatePriceListItem(id: string): Promise<PriceListItem> {
  return apiFetch<PriceListItem>(`/price-list-items/${encodeURIComponent(id)}/deactivate`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}

export function reactivatePriceListItem(id: string): Promise<PriceListItem> {
  return apiFetch<PriceListItem>(`/price-list-items/${encodeURIComponent(id)}/reactivate`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}
