import { apiFetch } from "./client";
import type { PrintableReceipt } from "../types/receipts";

export function getPrintableReceipt(ledgerEntryId: string) {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt`,
  );
}

export function markReceiptPrinted(ledgerEntryId: string, authorizedBy: string) {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt/print`,
    { method: "POST", headers: { "X-Authorized-By": authorizedBy } },
  );
}
