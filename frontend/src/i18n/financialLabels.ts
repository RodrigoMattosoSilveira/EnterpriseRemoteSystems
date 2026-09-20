import type { TranslationKey } from "./resources";
import { translateEnglish, type Translate } from "./translateResource";

const ledgerEntryTypeKeys = {
  EARNING_CREDIT: "financial.entry.EARNING_CREDIT",
  EXPENSE_DEDUCTION: "financial.entry.EXPENSE_DEDUCTION",
  GOLD_TO_BRL_CONVERSION: "financial.entry.GOLD_TO_BRL_CONVERSION",
  PIX_REMITTANCE: "financial.entry.PIX_REMITTANCE",
  REPLACEMENT_TRANSFER: "financial.entry.REPLACEMENT_TRANSFER",
  PAYOUT: "financial.entry.PAYOUT",
  FINAL_SETTLEMENT: "financial.entry.FINAL_SETTLEMENT",
  ADJUSTMENT: "financial.entry.ADJUSTMENT",
  DEBIT: "financial.entry.DEBIT",
  CREDIT: "financial.entry.CREDIT",
} satisfies Record<string, TranslationKey>;

const directionKeys = {
  DEBIT: "financial.direction.DEBIT",
  CREDIT: "financial.direction.CREDIT",
} satisfies Record<string, TranslationKey>;

const sourceTypeKeys = {
  EXPENSE: "financial.source.EXPENSE",
  EXPENSE_REPLACEMENT: "financial.source.EXPENSE_REPLACEMENT",
  JOURNEY_SETTLEMENT: "financial.source.JOURNEY_SETTLEMENT",
  LEDGER_CORRECTION: "financial.source.LEDGER_CORRECTION",
  ACCRUAL_ITEM: "financial.source.ACCRUAL_ITEM",
  WORK_PERIOD_ASSIGNMENT: "financial.source.WORK_PERIOD_ASSIGNMENT",
} satisfies Record<string, TranslationKey>;

const receiptPurposeKeys = {
  LEDGER_DEBIT: "financial.receiptPurpose.LEDGER_DEBIT",
  FINAL_SETTLEMENT_TENANT_PAYMENT: "financial.receiptPurpose.FINAL_SETTLEMENT_TENANT_PAYMENT",
  FINAL_SETTLEMENT_COLLABORATOR_PAYMENT: "financial.receiptPurpose.FINAL_SETTLEMENT_COLLABORATOR_PAYMENT",
} satisfies Record<string, TranslationKey>;

const paymentDirectionKeys = {
  ACCOUNT_DEBIT: "financial.paymentDirection.ACCOUNT_DEBIT",
  TENANT_TO_COLLABORATOR: "financial.paymentDirection.TENANT_TO_COLLABORATOR",
  COLLABORATOR_TO_TENANT: "financial.paymentDirection.COLLABORATOR_TO_TENANT",
} satisfies Record<string, TranslationKey>;

const acceptingPartyKeys = {
  COLLABORATOR: "financial.party.COLLABORATOR",
  TENANT: "financial.party.TENANT",
} satisfies Record<string, TranslationKey>;

const acceptanceMethodKeys = {
  IN_APP: "financial.acceptanceMethod.IN_APP",
} satisfies Record<string, TranslationKey>;

export function ledgerEntryTypeLabel(value: string, t: Translate = translateEnglish): string {
  return translateCode(value, ledgerEntryTypeKeys, t);
}

export function ledgerDirectionLabel(value: string, t: Translate = translateEnglish): string {
  return translateCode(value, directionKeys, t);
}

export function ledgerSourceTypeLabel(value: string, t: Translate = translateEnglish): string {
  return translateCode(value, sourceTypeKeys, t);
}

export function receiptPurposeLabel(value: string, t: Translate = translateEnglish): string {
  return translateCode(value, receiptPurposeKeys, t);
}

export function paymentDirectionCodeLabel(value: string, t: Translate = translateEnglish): string {
  return translateCode(value, paymentDirectionKeys, t);
}

export function acceptingPartyCodeLabel(value: string, t: Translate = translateEnglish): string {
  return translateCode(value, acceptingPartyKeys, t);
}

export function acceptanceMethodLabel(value: string, t: Translate = translateEnglish): string {
  return translateCode(value, acceptanceMethodKeys, t);
}

function translateCode(
  value: string,
  keys: Record<string, TranslationKey>,
  t: Translate,
): string {
  const normalized = value.trim().toUpperCase();
  if (!normalized) {
    return "—";
  }

  const key = keys[normalized];
  return key ? t(key) : humanizeCode(value);
}

function humanizeCode(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", " ");
}
