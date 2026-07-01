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

export function MineProductionPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedWorkPeriodId = searchParams.get("workPeriodId") ?? "";
  const [editingEntry, setEditingEntry] = useState<GoldProductionEntry | null>(
    null,
  );
  const [resetToken, setResetToken] = useState(0);
  const workPeriodsQuery = useWorkPeriods({ pageSize: 200 });
  const selectedWorkPeriodQuery = useWorkPeriod(selectedWorkPeriodId);
  const locationsQuery = useReferenceDataByType("location");
  const productionQuery = useGoldProductionEntries(
    selectedWorkPeriodId,
    Boolean(selectedWorkPeriodId),
  );
  const createMutation = useCreateMineProduction(selectedWorkPeriodId);
  const updateMutation = useUpdateMineProduction(selectedWorkPeriodId);
  const workPeriods = useMemo(
    () => workPeriodsQuery.data?.items ?? [],
    [workPeriodsQuery.data],
  );
  const selectedWorkPeriod =
    workPeriods.find((row) => row.id === selectedWorkPeriodId) ??
    selectedWorkPeriodQuery.data;
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
              Earnings
            </p>
            <h1 className="text-2xl font-bold text-gray-950">
              Gold Production
            </h1>
            <p className="text-sm text-gray-500">
              Authorized actors record and edit mine production here. Accrual
              uses these records as read-only inputs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm"
              to="/work-periods"
            >
              Work Periods
            </Link>
            {selectedWorkPeriodId ? (
              <Link
                className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm"
                to={`/work-periods/${encodeURIComponent(selectedWorkPeriodId)}`}
              >
                Open Accrual
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-4">
          <ApiErrorPanel error={error} />
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-gray-700">
              Work Period *
              <select
                className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                value={selectedWorkPeriodId}
                onChange={(event) => selectWorkPeriod(event.target.value)}
              >
                <option value="">Select a Work Period</option>
                {workPeriods.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.workDate} · {row.name} ·{" "}
                    {humanizePlanningCode(row.status)}
                  </option>
                ))}
              </select>
            </label>
            {!selectedWorkPeriodId ? (
              <p className="mt-3 text-sm text-gray-500">
                Select a Work Period to view, record, or edit its Gold
                Production entries.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  Recorded Gold Production
                </h2>
                <p className="text-sm text-gray-500">
                  These entries are the source of the read-only Gold Produced
                  values shown in Work Period Accrual.
                </p>
              </div>
              {selectedWorkPeriod ? (
                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                  {selectedWorkPeriod.workDate}
                </span>
              ) : null}
            </div>
            {productionQuery.isLoading ? (
              <p className="mt-4 text-sm text-gray-500">
                Loading production...
              </p>
            ) : !selectedWorkPeriodId ? (
              <p className="mt-4 text-sm text-gray-500">
                Select a Work Period to load production entries.
              </p>
            ) : entries.length === 0 ? (
              <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                No gold production has been recorded for this Work Period.
              </p>
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
                          {entry.productionDate}
                          {entry.notes ? ` · ${entry.notes}` : ""}
                        </p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="font-mono text-lg font-bold">
                          {entry.goldGramsProduced.toFixed(8)} g
                        </p>
                        <button
                          type="button"
                          className="mt-2 text-sm font-semibold text-gray-900 underline"
                          onClick={() => setEditingEntry(entry)}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <MineProductionForm
          workDate={selectedWorkPeriod?.workDate}
          locations={locations}
          editingEntry={editingEntry}
          pending={pending}
          resetToken={resetToken}
          onSubmit={submit}
          onCancelEdit={() => setEditingEntry(null)}
        />
      </section>
    </main>
  );
}
