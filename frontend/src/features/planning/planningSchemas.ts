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

export function humanizePlanningCode(value?: string) {
  if (!value) return "Not marked";
  return value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
