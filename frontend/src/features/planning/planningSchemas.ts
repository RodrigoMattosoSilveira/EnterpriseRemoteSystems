import type { TFunction } from "i18next";
import type { ActualStatus, PlannedStatus, WorkPeriodStatus } from "../../types/planning";

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

export function humanizePlanningCode(value?: string, t?: TFunction<"planning">) {
  if (!value) return t ? t("codes.notMarked") : "Not marked";
  const key = `codes.${valueTypeKey(value)}`;
  if (t && key) {
    const translated = t(key, { defaultValue: value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ") });
    if (translated && translated !== key) return translated;
  }
  return value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function valueTypeKey(value: string) {
  const normalized = value.toUpperCase();
  if (["PLANNING", "INFORMED", "ACCRUAL_OPEN", "PARTIALLY_POSTED", "FULLY_POSTED", "CLOSED"].includes(normalized)) {
    return `statuses.${normalized}`;
  }
  if (["INCLUDED", "EXCLUDED"].includes(normalized)) {
    return `plannedStatuses.${normalized}`;
  }
  if (["WORKED", "ABSENT", "SICK_DAY_OFF", "TIME_OFF", "REPLACED", "CANCELLED"].includes(normalized)) {
    return `actualStatuses.${normalized}`;
  }
  if (["ACTIVE", "DAY_OFF", "LEAVE_OF_ABSENCE"].includes(normalized)) {
    return `availabilities.${normalized}`;
  }
  return undefined;
}
