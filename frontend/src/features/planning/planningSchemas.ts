import type { ActualStatus, PlannedStatus, WorkPeriodStatus } from "../../types/planning";
import { translateEnglish, type Translate, type TranslationKey } from "../../i18n";

export const WORK_PERIOD_STATUSES: WorkPeriodStatus[] = [
  "PLANNING",
  "INFORMED",
  "ACCRUAL_OPEN",
  "PARTIALLY_POSTED",
  "FULLY_POSTED",
  "CLOSED",
];

export const PLANNED_STATUSES: PlannedStatus[] = ["INCLUDED", "EXCLUDED"];

export const ACTUAL_STATUSES: ActualStatus[] = [
  "WORKED",
  "ABSENT",
  "SICK_DAY_OFF",
  "TIME_OFF",
  "REPLACED",
  "CANCELLED",
];

const planningCodeTranslationKeys: Record<string, TranslationKey> = {
  PLANNING: "planning.code.PLANNING",
  INFORMED: "planning.code.INFORMED",
  ACCRUAL_OPEN: "planning.code.ACCRUAL_OPEN",
  PARTIALLY_POSTED: "planning.code.PARTIALLY_POSTED",
  FULLY_POSTED: "planning.code.FULLY_POSTED",
  CLOSED: "planning.code.CLOSED",
  INCLUDED: "planning.code.INCLUDED",
  EXCLUDED: "planning.code.EXCLUDED",
  WORKED: "planning.code.WORKED",
  ABSENT: "planning.code.ABSENT",
  SICK_DAY_OFF: "planning.code.SICK_DAY_OFF",
  TIME_OFF: "planning.code.TIME_OFF",
  REPLACED: "planning.code.REPLACED",
  CANCELLED: "planning.code.CANCELLED",
  DRAFT: "planning.code.DRAFT",
  PENDING_INPUT: "planning.code.PENDING_INPUT",
  READY_TO_POST: "planning.code.READY_TO_POST",
  POSTED: "planning.code.POSTED",
  VOIDED: "planning.code.VOIDED",
  PENDING: "planning.code.PENDING",
  READY: "planning.code.READY",
  SKIPPED: "planning.code.SKIPPED",
  ACTUAL_OUTCOME: "planning.code.ACTUAL_OUTCOME",
  DAILY_BRL: "planning.code.DAILY_BRL",
  FIXED_BRL_DAILY: "planning.code.FIXED_BRL_DAILY",
  GOLD_COMMISSION: "planning.code.GOLD_COMMISSION",
  ACTUAL_OUTCOME_MISSING: "planning.code.ACTUAL_OUTCOME_MISSING",
  GOLD_PRODUCTION_MISSING: "planning.code.GOLD_PRODUCTION_MISSING",
  PAYMENT_CONFIGURATION_MISSING: "planning.code.PAYMENT_CONFIGURATION_MISSING",
  REPLACEMENT_RULE_DEFERRED: "planning.code.REPLACEMENT_RULE_DEFERRED",
  REPLACEMENT_ASSIGNMENT_MISSING: "planning.code.REPLACEMENT_ASSIGNMENT_MISSING",
};

export function humanizePlanningCode(
  value: string | undefined,
  t: Translate = translateEnglish,
) {
  if (!value) return t("planning.notMarked");
  const normalized = value.trim().toUpperCase();
  const translationKey = planningCodeTranslationKeys[normalized];
  if (translationKey) return t(translationKey);
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
