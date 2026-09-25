import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { loadAuthTenantOptions } from "../../api/auth.api";
import { useAuthState } from "../../app/useAuth";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import type {
  ActualStatus,
  WorkPeriodAssignment,
  WorkPeriodStatus,
} from "../../types/planning";
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
import { PageContextHeading, PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";

type Tab = "plan" | "inform" | "outcomes" | "accrual";

export function WorkPeriodDetailPage() {
  const { t, formatDate, formatDateTime } = useI18n();
  const { id = "" } = useParams();
  const [selectedTab, setSelectedTab] = useState<Tab | null>(null);
  const auth = useAuthState();
  const accountId =
    auth.status === "authenticated" ? auth.session.accountId : "";
  const tenantOptionsQuery = useQuery({
    queryKey: ["auth", accountId, "tenant-options"],
    queryFn: loadAuthTenantOptions,
    enabled: Boolean(accountId),
    staleTime: 60_000,
  });
  const periodQuery = useWorkPeriod(id);
  const period = periodQuery.data;
  const tab = selectedTab ?? defaultTabForWorkPeriodStatus(period?.status);
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
        {t("planning.loadingPeriod")}
      </main>
    );
  const editable = period.status !== "CLOSED";
  const tenantName =
    tenantOptionsQuery.data?.find((tenant) => tenant.id === period.tenantId)
      ?.name ?? period.tenantId;
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
            {t("planning.backPeriods")}
          </Link>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <PageTitle>{t("planning.workPeriod")}</PageTitle>
              <PageContextHeading>
                {tenantName} · {formatDate(period.workDate)} · {period.name}
              </PageContextHeading>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-semibold">{t("planning.workPeriodCode")}:</span>{" "}
                <span className="font-mono">{period.periodCode}</span>
              </p>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-semibold">{t("planning.workPeriodId")}:</span>{" "}
                <span className="break-all font-mono">{period.id}</span>
              </p>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-semibold">{t("planning.schedule")}:</span>{" "}
                {formatDateTime(period.startsAt)} {t("common.to")}{" "}
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
        <ApiErrorPanel error={error} translate={t} />
        <nav className="flex gap-2 overflow-x-auto rounded-2xl border bg-white p-2 shadow-sm print:hidden">
          {(["plan", "inform", "outcomes", "accrual"] as Tab[]).map((value) => (
            <button
              key={value}
              onClick={() => setSelectedTab(value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === value ? "bg-gray-950 text-white" : "text-gray-600"}`}
            >
              {value === "plan"
                ? t("planning.tabPlan")
                : value === "inform"
                  ? t("planning.informPrint")
                  : value === "outcomes"
                    ? t("planning.tabOutcomes")
                    : t("planning.tabAccrual")}
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
              <h2 className="text-lg font-semibold">{t("planning.actualOutcomes")}</h2>
              <p className="text-sm text-gray-500">
                {t("planning.outcomesHelp")}
              </p>
            </div>
            {included.length === 0 && (
              <div className="rounded-2xl border bg-white p-6 text-center text-sm text-gray-500">
                {t("planning.noIncluded")}
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
                  {t("planning.outcome")}
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
                    <option value="">{t("planning.notMarked")}</option>
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

function defaultTabForWorkPeriodStatus(status: WorkPeriodStatus | undefined): Tab {
  switch (status) {
    case "INFORMED":
      return "outcomes";
    case "ACCRUAL_OPEN":
    case "PARTIALLY_POSTED":
    case "FULLY_POSTED":
    case "CLOSED":
      return "accrual";
    case "PLANNING":
    default:
      return "plan";
  }
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
