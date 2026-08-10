import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import type { ActualStatus, WorkPeriodAssignment } from "../../types/planning";
import { ACTUAL_STATUSES, humanizePlanningCode } from "./planningSchemas";
import { AccrualTab } from "./AccrualTab";
import { InformTab } from "./InformTab";
import { PlanTab } from "./PlanTab";
import {
  useAssignments,
  useBulkPlanAssignments,
  useInformWorkPeriod,
  useMarkOutcome,
  usePlanningTemplate,
  useRefinePlanAssignment,
  useWorkPeriod,
  useWorkPlanRoster,
} from "./usePlanning";

type Tab = "plan" | "inform" | "outcomes" | "accrual";

export function WorkPeriodDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation("planning");
  const [tab, setTab] = useState<Tab>("plan");
  const periodQuery = useWorkPeriod(id);
  const assignmentsQuery = useAssignments(id);
  const sectorsQuery = useReferenceDataByType("sector");
  const locationsQuery = useReferenceDataByType("location");
  const tasksQuery = useReferenceDataByType("task");
  const rosterQuery = useWorkPlanRoster(id, tab === "inform");
  const planningTemplateQuery = usePlanningTemplate(id);
  const bulkPlanMutation = useBulkPlanAssignments(id);
  const refinePlanMutation = useRefinePlanAssignment(id);
  const outcomeMutation = useMarkOutcome(id);
  const informMutation = useInformWorkPeriod(id);

  const assignments = useMemo(
    () => assignmentsQuery.data?.items ?? [],
    [assignmentsQuery.data],
  );
  const period = periodQuery.data;
  const error =
    periodQuery.error ||
    assignmentsQuery.error ||
    sectorsQuery.error ||
    locationsQuery.error ||
    tasksQuery.error ||
    rosterQuery.error ||
    planningTemplateQuery.error ||
    bulkPlanMutation.error ||
    refinePlanMutation.error ||
    outcomeMutation.error ||
    informMutation.error;
  const pending = bulkPlanMutation.isPending || refinePlanMutation.isPending;
  const unreplacedAbsentees = useMemo(
    () => unreplacedAbsenteeAssignments(assignments),
    [assignments],
  );

  if (periodQuery.isLoading || !period)
    return (
      <main className="min-h-screen bg-gray-50 p-6">
        Loading work period...
      </main>
    );
  const editable = period.status !== "CLOSED";
  const included = assignments.filter(
    (row) => row.active && row.plannedStatus === "INCLUDED",
  );

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur print:hidden">
        <div className="mx-auto max-w-6xl">
          <Link
            to="/work-periods"
            className="text-sm font-semibold text-gray-600 underline"
          >
            {t("detail.backToWorkPeriods")}
          </Link>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {period.workDate} · {period.periodCode}
              </p>
              <h1 className="text-2xl font-bold">{period.name}</h1>
              <p className="text-sm text-gray-500">
                {formatDateTime(period.startsAt)} to{" "}
                {formatDateTime(period.endsAt)}
              </p>
            </div>
            <span className="w-fit rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">
              {humanizePlanningCode(period.status, t)}
            </span>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-6xl space-y-4 p-4 print:max-w-none print:p-0">
        <ApiErrorPanel error={error} />
        <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm print:hidden">
          {(["plan", "inform", "outcomes", "accrual"] as Tab[]).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === value ? "bg-gray-950 text-white" : "text-gray-600"}`}
            >
              {value === "plan"
                ? t("detail.tabs.plan")
                : value === "inform"
                  ? t("detail.tabs.inform")
                  : value === "outcomes"
                    ? t("detail.tabs.outcomes")
                    : t("detail.tabs.accrual")}
            </button>
          ))}
        </nav>
        {tab === "plan" && (
          <PlanTab
            template={planningTemplateQuery.data}
            sectors={sectorsQuery.data ?? []}
            locations={locationsQuery.data ?? []}
            tasks={tasksQuery.data ?? []}
            editable={editable}
            loading={
              planningTemplateQuery.isLoading ||
              sectorsQuery.isLoading ||
              locationsQuery.isLoading ||
              tasksQuery.isLoading
            }
            pending={pending}
            onBulkPlan={(input) => bulkPlanMutation.mutate(input)}
            onRefineAssignment={(input) =>
              refinePlanMutation.mutateAsync(input)
            }
          />
        )}
        {tab === "inform" && (
          <InformTab
            workPeriod={period}
            roster={rosterQuery.data}
            loading={rosterQuery.isLoading}
            pending={informMutation.isPending}
            unreplacedAbsentees={unreplacedAbsentees}
            onInform={() => informMutation.mutate()}
          />
        )}
        {tab === "outcomes" && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t("detail.tabs.outcomes")}</h2>
              <p className="text-sm text-gray-500">
                {t("detail.outcomesIntro")}
              </p>
            </div>
            {included.length === 0 && (
              <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-500">
                {t("detail.outcomesEmpty")}
              </div>
            )}
            {included.map((row) => (
              <article
                key={row.id}
                className="flex flex-col gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="font-semibold">
                    {row.collaboratorName ||
                      row.collaboratorNickname ||
                      row.collaboratorId}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {row.sectorLabel} · {row.locationLabel} · {row.taskLabel}
                  </p>
                </div>
                <label className="text-sm font-medium text-gray-700">
                  {t("detail.outcomeLabel")}
                  <select
                    value={row.actualStatus ?? ""}
                    disabled={!editable || outcomeMutation.isPending}
                    onChange={(event) =>
                      event.target.value &&
                      outcomeMutation.mutate({
                        assignmentId: row.id,
                        actualStatus: event.target.value as ActualStatus,
                      })
                    }
                    className="ml-3 rounded-xl border bg-white px-3 py-2"
                  >
                    <option value="">{t("detail.outcomePlaceholder")}</option>
                    {ACTUAL_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {humanizePlanningCode(status, t)}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            ))}
          </section>
        )}
        {tab === "accrual" && (
          <AccrualTab
            workPeriod={period}
            locations={locationsQuery.data ?? []}
          />
        )}
      </section>
    </main>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function unreplacedAbsenteeAssignments(assignments: WorkPeriodAssignment[]) {
  const replacedAssignmentIds = new Set(
    assignments
      .map((row) => row.replacementForAssignmentId?.trim())
      .filter(Boolean),
  );
  return assignments.filter(
    (row) =>
      row.active &&
      (row.planningAvailability === "DAY_OFF" ||
        row.planningAvailability === "LEAVE_OF_ABSENCE") &&
      !replacedAssignmentIds.has(row.id),
  );
}
