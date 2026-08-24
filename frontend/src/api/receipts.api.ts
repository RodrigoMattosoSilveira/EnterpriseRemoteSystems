import { apiFetch } from "./client";
import type {
  AcceptReceiptRequest,
  OutstandingReceiptListFilter,
  OutstandingReceiptListResult,
  PrintableReceipt,
  ReturnReceiptRequest,
} from "../types/receipts";


export function listOutstandingReceipts(filter: OutstandingReceiptListFilter = {}) {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.collaborator) params.set("collaborator", filter.collaborator);
  if (filter.sourceType) params.set("sourceType", filter.sourceType);
  if (filter.page) params.set("page", String(filter.page));
  if (filter.pageSize) params.set("pageSize", String(filter.pageSize));
  const query = params.toString();
  return apiFetch<OutstandingReceiptListResult>(`/receipts/outstanding${query ? `?${query}` : ""}`);
}

export function getPrintableReceipt(ledgerEntryId: string, selfService = false) {
  const suffix = selfService ? "/receipt/self" : "/receipt";
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}${suffix}`,
  );
}

export function markReceiptPrinted(ledgerEntryId: string) {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt/print`,
    { method: "POST" },
  );
}

export function acceptReceipt(
  ledgerEntryId: string,
  input: AcceptReceiptRequest,
): Promise<PrintableReceipt> {
  return apiFetch<PrintableReceipt>(
    `/ledger-entries/${encodeURIComponent(ledgerEntryId)}/receipt/accept`,
    { method: "POST", body: JSON.stringify(input) },
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
