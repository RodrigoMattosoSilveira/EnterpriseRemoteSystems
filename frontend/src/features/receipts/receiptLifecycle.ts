import type { PrintableReceipt } from "../../types/receipts";

export const receiptStatusLabels: Record<string, string> = {
  PENDING_ISSUE: "Pending issue",
  ISSUED: "Issued",
  PRINTED: "Printed",
  SIGNED: "Signed",
  RETURNED: "Returned",
  CANCELLED: "Cancelled",
};

const statusRanks: Record<string, number> = {
  PENDING_ISSUE: 0,
  ISSUED: 1,
  PRINTED: 2,
  SIGNED: 3,
  RETURNED: 4,
  CANCELLED: 5,
};

export type ReceiptLifecycleStep = {
  key: "issued" | "printed" | "signed" | "returned";
  label: string;
  completed: boolean;
  detail: string;
};

export function receiptStatusLabel(status: string): string {
  return receiptStatusLabels[status] ?? humanize(status);
}

export function receiptStatusTone(status: string): string {
  switch (status) {
    case "RETURNED":
      return "bg-green-100 text-green-800";
    case "CANCELLED":
      return "bg-red-100 text-red-800";
    case "SIGNED":
      return "bg-blue-100 text-blue-800";
    case "PRINTED":
      return "bg-purple-100 text-purple-800";
    case "ISSUED":
      return "bg-indigo-100 text-indigo-800";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

export function isReceiptTerminal(status: string): boolean {
  return status === "RETURNED" || status === "CANCELLED";
}

export function canPrintReceipt(receipt: PrintableReceipt): boolean {
  return !isReceiptTerminal(receipt.status);
}

export function canReturnReceipt(receipt: PrintableReceipt): boolean {
  return !isReceiptTerminal(receipt.status);
}

export function nextReceiptAction(receipt: PrintableReceipt): string {
  if (receipt.status === "RETURNED") return "Lifecycle complete";
  if (receipt.status === "CANCELLED") return "No action allowed";
  if (receipt.status === "PENDING_ISSUE" || receipt.status === "ISSUED") {
    return "Print receipt";
  }
  return "Record signed return";
}

export function receiptLifecycleSteps(receipt: PrintableReceipt): ReceiptLifecycleStep[] {
  return [
    {
      key: "issued",
      label: "Issued",
      completed: isAtLeast(receipt.status, "ISSUED") || Boolean(receipt.issuedAt || receipt.issuedBy),
      detail: receipt.issuedAt ? `Issued ${formatDateTime(receipt.issuedAt)}` : "Waiting to be issued",
    },
    {
      key: "printed",
      label: "Printed",
      completed: isAtLeast(receipt.status, "PRINTED") || Boolean(receipt.printedAt),
      detail: receipt.printedAt ? `Printed ${formatDateTime(receipt.printedAt)}` : "Waiting to be printed",
    },
    {
      key: "signed",
      label: "Signed",
      completed: isAtLeast(receipt.status, "SIGNED") || Boolean(receipt.signedAt),
      detail: receipt.signedAt ? `Signed ${formatDateTime(receipt.signedAt)}` : "Waiting for collaborator signature",
    },
    {
      key: "returned",
      label: "Returned",
      completed: receipt.status === "RETURNED" || Boolean(receipt.returnedAt),
      detail: receipt.returnedAt ? `Returned ${formatDateTime(receipt.returnedAt)}` : "Waiting for office return record",
    },
  ];
}

function isAtLeast(status: string, threshold: string): boolean {
  if (status === "CANCELLED") return false;
  return (statusRanks[status] ?? 0) >= (statusRanks[threshold] ?? 0);
}

function humanize(value: string): string {
  return value.toLowerCase().replaceAll("_", " ");
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
