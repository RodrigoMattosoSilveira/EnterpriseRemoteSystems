import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptReceipt,
  getPrintableReceipt,
  listOutstandingReceipts,
  markReceiptPrinted,
  markReceiptReturned,
} from "../../api/receipts.api";
import type { AcceptReceiptRequest, OutstandingReceiptListFilter, ReturnReceiptRequest } from "../../types/receipts";


export function useOutstandingReceipts(filter: OutstandingReceiptListFilter) {
  return useQuery({
    queryKey: ["outstanding-receipts", filter],
    queryFn: () => listOutstandingReceipts(filter),
  });
}

export function usePrintableReceipt(ledgerEntryId: string, selfService = false) {
  return useQuery({
    queryKey: ["ledger-receipt", ledgerEntryId, selfService ? "self" : "tenant"],
    queryFn: () => getPrintableReceipt(ledgerEntryId, selfService),
    enabled: Boolean(ledgerEntryId),
  });
}

export function usePrintReceipt(ledgerEntryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => markReceiptPrinted(ledgerEntryId),
    onSuccess: (receipt) => {
      queryClient.setQueriesData({ queryKey: ["ledger-receipt", ledgerEntryId] }, receipt);
      void queryClient.invalidateQueries({ queryKey: ["outstanding-receipts"] });
    },
  });
}

export function useAcceptReceipt(ledgerEntryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AcceptReceiptRequest) => acceptReceipt(ledgerEntryId, payload),
    onSuccess: (receipt) => {
      queryClient.setQueriesData({ queryKey: ["ledger-receipt", ledgerEntryId] }, receipt);
      void queryClient.invalidateQueries({ queryKey: ["outstanding-receipts"] });
      void queryClient.invalidateQueries({ queryKey: ["settlements"] });
    },
  });
}

export function useReturnReceipt(ledgerEntryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReturnReceiptRequest) =>
      markReceiptReturned(ledgerEntryId, payload),
    onSuccess: (receipt) => {
      queryClient.setQueriesData({ queryKey: ["ledger-receipt", ledgerEntryId] }, receipt);
      void queryClient.invalidateQueries({ queryKey: ["outstanding-receipts"] });
    },
  });
}
