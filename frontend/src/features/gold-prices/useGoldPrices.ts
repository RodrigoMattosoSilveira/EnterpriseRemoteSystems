import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGoldPrice,
  deactivateGoldPrice,
  getLatestGoldPrice,
  listGoldPrices,
} from "../../api/goldPrices.api";
import type { CreateGoldPriceInput } from "../../types/goldPrices";

export function useGoldPrices(includeInactive: boolean) {
  return useQuery({
    queryKey: ["gold-prices", { includeInactive }],
    queryFn: () => listGoldPrices(includeInactive),
  });
}

export function useLatestGoldPrice() {
  return useQuery({
    queryKey: ["gold-prices", "latest"],
    queryFn: getLatestGoldPrice,
    retry: false,
  });
}

export function useCreateGoldPrice(includeInactive: boolean) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGoldPriceInput) => createGoldPrice(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-prices"] });
      queryClient.invalidateQueries({ queryKey: ["gold-prices", { includeInactive }] });
      queryClient.invalidateQueries({ queryKey: ["gold-prices", "latest"] });
    },
  });
}

export function useDeactivateGoldPrice(includeInactive: boolean) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deactivateGoldPrice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gold-prices"] });
      queryClient.invalidateQueries({ queryKey: ["gold-prices", { includeInactive }] });
      queryClient.invalidateQueries({ queryKey: ["gold-prices", "latest"] });
    },
  });
}
