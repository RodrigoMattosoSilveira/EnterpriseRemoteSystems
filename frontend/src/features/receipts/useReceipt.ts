import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getPrintableReceipt,
  listOutstandingReceipts,
  markReceiptPrinted,
  markReceiptReturned,
} from "../../api/receipts.api";
import type { OutstandingReceiptListFilter, ReturnReceiptRequest } from "../../types/receipts";


export function useOutstandingReceipts(filter: OutstandingReceiptListFilter) {
  return useQuery({
    queryKey: ["outstanding-receipts", filter],
    queryFn: () => listOutstandingReceipts(filter),
  });
}

export function usePrintableReceipt(ledgerEntryId: string) {
  return useQuery({
    queryKey: ["ledger-receipt", ledgerEntryId],
    queryFn: () => getPrintableReceipt(ledgerEntryId),
    enabled: Boolean(ledgerEntryId),
  });
}

export function usePrintReceipt(ledgerEntryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (authorizedBy: string) => markReceiptPrinted(ledgerEntryId, authorizedBy),
    onSuccess: (receipt) => queryClient.setQueryData(["ledger-receipt", ledgerEntryId], receipt),
  });
}

export function useReturnReceipt(ledgerEntryId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ authorizedBy, payload }: { authorizedBy: string; payload: ReturnReceiptRequest }) =>
      markReceiptReturned(ledgerEntryId, authorizedBy, payload),
    onSuccess: (receipt) => queryClient.setQueryData(["ledger-receipt", ledgerEntryId], receipt),
  });
}
