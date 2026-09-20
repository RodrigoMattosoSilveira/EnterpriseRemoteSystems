import type { PrintableReceipt } from "../../types/receipts";
import { translateEnglish, type Translate } from "../../i18n";

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

export function receiptStatusLabel(
  status: string,
  t: Translate = translateEnglish,
): string {
  switch (status) {
    case "PENDING_ISSUE":
      return t("receipt.status.pendingIssue");
    case "ISSUED":
      return t("receipt.status.issued");
    case "PRINTED":
      return t("receipt.status.printed");
    case "SIGNED":
      return t("receipt.status.signed");
    case "RETURNED":
      return t("receipt.status.returned");
    case "CANCELLED":
      return t("receipt.status.cancelled");
    default:
      return humanize(status);
  }
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

export function nextReceiptAction(
  receipt: PrintableReceipt,
  t: Translate = translateEnglish,
): string {
  if (receipt.status === "RETURNED") return t("receipt.action.lifecycleComplete");
  if (receipt.status === "CANCELLED") return t("receipt.action.noneAllowed");
  if (receipt.status === "PENDING_ISSUE" || receipt.status === "ISSUED") {
    return t("receipt.action.print");
  }
  return t("receipt.action.recordReturn");
}

export function receiptLifecycleSteps(
  receipt: PrintableReceipt,
  t: Translate = translateEnglish,
  formatDateTime: (value: string) => string = defaultFormatDateTime,
): ReceiptLifecycleStep[] {
  return [
    {
      key: "issued",
      label: t("receipt.lifecycle.issued"),
      completed: isAtLeast(receipt.status, "ISSUED") || Boolean(receipt.issuedAt || receipt.issuedBy),
      detail: receipt.issuedAt
        ? t("receipt.lifecycle.issuedAt", { date: formatDateTime(receipt.issuedAt) })
        : t("receipt.lifecycle.waitingIssue"),
    },
    {
      key: "printed",
      label: t("receipt.lifecycle.printed"),
      completed: isAtLeast(receipt.status, "PRINTED") || Boolean(receipt.printedAt),
      detail: receipt.printedAt
        ? t("receipt.lifecycle.printedAt", { date: formatDateTime(receipt.printedAt) })
        : t("receipt.lifecycle.waitingPrint"),
    },
    {
      key: "signed",
      label: t("receipt.lifecycle.signed"),
      completed: isAtLeast(receipt.status, "SIGNED") || Boolean(receipt.signedAt),
      detail: receipt.signedAt
        ? t("receipt.lifecycle.signedAt", { date: formatDateTime(receipt.signedAt) })
        : t("receipt.lifecycle.waitingSignature"),
    },
    {
      key: "returned",
      label: t("receipt.lifecycle.returned"),
      completed: receipt.status === "RETURNED" || Boolean(receipt.returnedAt),
      detail: receipt.returnedAt
        ? t("receipt.lifecycle.returnedAt", { date: formatDateTime(receipt.returnedAt) })
        : t("receipt.lifecycle.waitingReturn"),
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

function defaultFormatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
