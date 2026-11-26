import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { GoldProductionEntry } from "../../types/accruals";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { humanizePlanningCode } from "../planning/planningSchemas";
import { useGoldProductionEntries } from "../planning/useAccruals";
import { useWorkPeriod, useWorkPeriods } from "../planning/usePlanning";
import {
  MineProductionForm,
  type MineProductionFormInput,
} from "./MineProductionForm";
import {
  useCreateMineProduction,
  useUpdateMineProduction,
} from "./useMineProduction";
import { PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";

// A work period is completed once its end instant has passed. Comparing the
// instant (endsAt) with now is timezone-safe: it does not depend on the user's
// or the tenant's calendar date. An unparseable endsAt counts as not completed.
export function isCompletedWorkPeriod(
  workPeriod: { endsAt: string },
  now: Date = new Date(),
): boolean {
  return Date.parse(workPeriod.endsAt) <= now.getTime();
}

// Today's date as YYYY-MM-DD in the user's local calendar. Used only as the
// server-side upper bound (dateTo) so future-dated periods never fill the page;
// whether a period is completed is decided by isCompletedWorkPeriod. Built from
// local date parts, not toISOString(), which returns the UTC date.
export function todayLocalDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function MineProductionPage() {
  const { t, formatDate, formatNumber } = useI18n();
  const actor = useAuthorizationContext();
  const canManage = actor.permissions.includes("*") || actor.permissions.includes("gold_production.manage");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedWorkPeriodId = searchParams.get("workPeriodId") ?? "";
  const [editingEntry, setEditingEntry] = useState<GoldProductionEntry | null>(
    null,
  );
  const [resetToken, setResetToken] = useState(0);
  // Work periods dated after today are never listed (server-side bound), so
  // they cannot push completed periods off the first page. Periods dated today
  // are fetched and then kept or dropped by their end time below.
  const workPeriodsQuery = useWorkPeriods({
    pageSize: 200,
    dateTo: todayLocalDate(),
  });
  const selectedWorkPeriodQuery = useWorkPeriod(selectedWorkPeriodId);
  const locationsQuery = useReferenceDataByType("location");
  const productionQuery = useGoldProductionEntries(
    selectedWorkPeriodId,
    Boolean(selectedWorkPeriodId),
  );
  const createMutation = useCreateMineProduction(selectedWorkPeriodId);
  const updateMutation = useUpdateMineProduction(selectedWorkPeriodId);
  const workPeriods = useMemo(
    () =>
      (workPeriodsQuery.data?.items ?? []).filter((row) =>
        isCompletedWorkPeriod(row),
      ),
    [workPeriodsQuery.data],
  );
  const selectedWorkPeriod =
    workPeriods.find((row) => row.id === selectedWorkPeriodId) ??
    selectedWorkPeriodQuery.data;
  // A deep link can select a work period that has not ended yet (or is dated
  // later). Block the form for it, matching the backend rule.
  const isNotCompleted = Boolean(
    selectedWorkPeriod && !isCompletedWorkPeriod(selectedWorkPeriod),
  );
  const locations = useMemo(
    () => (locationsQuery.data ?? []).filter((row) => row.active),
    [locationsQuery.data],
  );
  const entries = productionQuery.data?.items ?? [];
  const pending = createMutation.isPending || updateMutation.isPending;
  const error =
    workPeriodsQuery.error ||
    selectedWorkPeriodQuery.error ||
    locationsQuery.error ||
    productionQuery.error ||
    createMutation.error ||
    updateMutation.error;

  useEffect(() => {
    setEditingEntry(null);
  }, [selectedWorkPeriodId]);

  function selectWorkPeriod(workPeriodId: string) {
    const next = new URLSearchParams(searchParams);
    if (workPeriodId) next.set("workPeriodId", workPeriodId);
    else next.delete("workPeriodId");
    setSearchParams(next, { replace: true });
  }

  function submit(input: MineProductionFormInput) {
    if (editingEntry) {
      updateMutation.mutate(
        { entryId: editingEntry.id, input },
        {
          onSuccess: () => {
            setEditingEntry(null);
            setResetToken((value) => value + 1);
          },
        },
      );
      return;
    }
    createMutation.mutate(input, {
      onSuccess: () => setResetToken((value) => value + 1),
    });
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("production.earnings")}
            </p>
            <PageTitle>{t("production.title")}</PageTitle>
            <p className="text-sm text-gray-500">{t("production.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm"
              to="/work-periods"
            >
              {t("planning.workPeriods")}
            </Link>
            {selectedWorkPeriodId ? (
              <Link
                className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm"
                to={`/work-periods/${encodeURIComponent(selectedWorkPeriodId)}`}
              >
                {t("production.openAccrual")}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <ApiErrorPanel error={error} translate={t} />
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-gray-700">
              {t("production.workPeriodRequired")}
              <select
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={selectedWorkPeriodId}
                onChange={(event) => selectWorkPeriod(event.target.value)}
              >
                <option value="">{t("production.selectWorkPeriod")}</option>
                {workPeriods.map((row) => (
                  <option key={row.id} value={row.id}>
                    {formatDate(row.workDate)} · {row.name} ·{" "}
                    {humanizePlanningCode(row.status)}
                  </option>
                ))}
              </select>
            </label>
            {!selectedWorkPeriodId ? (
              <p className="mt-3 text-sm text-gray-500">{t("production.selectHelp")}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">{t("production.recorded")}</h2>
                <p className="text-sm text-gray-500">{t("production.recordedHelp")}</p>
              </div>
              {selectedWorkPeriod ? (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  {formatDate(selectedWorkPeriod.workDate)}
                </span>
              ) : null}
            </div>
            {productionQuery.isLoading ? (
              <p className="mt-4 text-sm text-gray-500">{t("production.loading")}</p>
            ) : !selectedWorkPeriodId ? (
              <p className="mt-4 text-sm text-gray-500">{t("production.selectToLoad")}</p>
            ) : entries.length === 0 ? (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("production.empty")}</p>
            ) : (
              <div className="mt-4 space-y-3">
                {entries.map((entry) => (
                  <article key={entry.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-gray-950">
                          {entry.locationLabel || entry.locationId}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(entry.productionDate)}
                          {entry.notes ? ` · ${entry.notes}` : ""}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-mono text-lg font-bold">
                          {formatNumber(entry.goldGramsProduced, { maximumFractionDigits: 8 })} g
                        </p>
                        {canManage ? <button
                          type="button"
                          className="mt-2 text-sm font-semibold text-gray-900 underline"
                          onClick={() => setEditingEntry(entry)}
                        >
                          {t("common.edit")}
                        </button> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        {canManage ? <div className="space-y-4">
          {isNotCompleted ? (
            <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t("production.notCompleted")}
            </p>
          ) : null}
        <MineProductionForm
          workDate={isNotCompleted ? undefined : selectedWorkPeriod?.workDate}
          locations={locations}
          editingEntry={editingEntry}
          pending={pending}
          resetToken={resetToken}
          onSubmit={submit}
          onCancelEdit={() => setEditingEntry(null)}
        />
        </div> : null}
      </section>
    </main>
  );
}
