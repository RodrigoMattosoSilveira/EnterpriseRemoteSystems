import { apiFetch } from "./client";
import type {
  OutstandingReceiptListFilter,
  OutstandingReceiptListResult,
  PrintableReceipt,
  ReturnReceiptRequest,
} from "../types/receipts";


export function listOutstandingReceipts(filter: OutstandingReceiptListFilter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.page) params.set("page", String(filter.page));
  if (filter.pageSize) params.set("pageSize", String(filter.pageSize));
  const query = params.toString();
  return apiFetch<OutstandingReceiptListResult>(`/receipts/outstanding${query ? `?${query}` : ""}`);
}

export function getPrintableReceipt(ledgerEntryId: string) {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt`,
  );
}

export function markReceiptPrinted(ledgerEntryId: string) {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt/print`,
    { method: "POST" },
  );
}

export function markReceiptReturned(
  ledgerEntryId: string,
  payload: ReturnReceiptRequest,
) {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt/return`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}
