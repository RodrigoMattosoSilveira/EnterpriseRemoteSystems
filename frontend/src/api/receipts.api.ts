import { apiFetch } from "./client";
import type { PrintableReceipt, ReturnReceiptRequest } from "../types/receipts";

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

export function markReceiptReturned(
  ledgerEntryId: string,
  authorizedBy: string,
  payload: ReturnReceiptRequest,
) {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt/return`,
    {
      method: "POST",
      headers: { "X-Authorized-By": authorizedBy },
      body: JSON.stringify(payload),
    },
  );
}
