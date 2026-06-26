import { apiFetch } from "./client";
import type { CreateGoldPriceInput, GoldPrice } from "../types/goldPrices";

export function listGoldPrices(includeInactive = false): Promise<GoldPrice[]> {
  const searchParams = new URLSearchParams();
  if (includeInactive) {
    searchParams.set("includeInactive", "true");
  }
  const query = searchParams.toString();
  return apiFetch<GoldPrice[]>(`/gold-prices${query ? `?${query}` : ""}`);
}

export function getLatestGoldPrice(): Promise<GoldPrice> {
  return apiFetch<GoldPrice>("/gold-prices/latest");
}

export function createGoldPrice(input: CreateGoldPriceInput): Promise<GoldPrice> {
  return apiFetch<GoldPrice>("/gold-prices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deactivateGoldPrice(id: string): Promise<GoldPrice> {
  return apiFetch<GoldPrice>(`/gold-prices/${encodeURIComponent(id)}/deactivate`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
}
