import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPrintableReceipt, markReceiptPrinted } from "../../api/receipts.api";

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
