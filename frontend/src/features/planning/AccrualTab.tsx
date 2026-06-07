import { useMemo, useState, type FormEvent } from "react";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { WorkPeriod } from "../../types/planning";
import type { ReferenceDataItem } from "../../types/referenceData";
import type { AccrualItem, AccrualRun } from "../../types/accruals";
import { humanizePlanningCode } from "./planningSchemas";
import {
  useAccrualItems,
  useAccrualRuns,
  useCreateAccrualRun,
  useCreateGoldProductionEntry,
  useGoldProductionEntries,
  usePostAccrualRun,
  useRecalculateAccrualRun,
} from "./useAccruals";

export function AccrualTab({
  workPeriod,
  locations,
}: {
  workPeriod: WorkPeriod;
  locations: ReferenceDataItem[];
}) {
  const runsQuery = useAccrualRuns(workPeriod.id);
  const productionQuery = useGoldProductionEntries(workPeriod.id);
  const createRun = useCreateAccrualRun(workPeriod.id);
  const createProduction = useCreateGoldProductionEntry(workPeriod.id);
  const recalculate = useRecalculateAccrualRun(workPeriod.id);
  const postRun = usePostAccrualRun(workPeriod.id);
  const [selectedRunId, setSelectedRunId] = useState("");
  const runs = useMemo(() => runsQuery.data?.items ?? [], [runsQuery.data]);
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
  const itemsQuery = useAccrualItems(
    selectedRun?.id ?? "",
    Boolean(selectedRun),
  );
  const items = itemsQuery.data?.items ?? [];
  const error =
    runsQuery.error ||
    productionQuery.error ||
    itemsQuery.error ||
    createRun.error ||
    createProduction.error ||
    recalculate.error ||
    postRun.error;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Accrual</h2>
        <p className="text-sm text-gray-500">
          Record well production, calculate collaborator earnings, review
          pending items, and post ready credits.
        </p>
      </div>
      <ApiErrorPanel error={error} />
      <GoldProductionPanel
        workPeriod={workPeriod}
        locations={locations.filter((row) => row.active)}
        entries={productionQuery.data?.items ?? []}
        pending={createProduction.isPending}
        onCreate={(input) => createProduction.mutate(input)}
      />
      <AccrualRunPanel
        workPeriod={workPeriod}
        runs={runs}
        selectedRun={selectedRun}
        items={items}
        loading={runsQuery.isLoading || itemsQuery.isLoading}
        createPending={createRun.isPending}
        recalculatePending={recalculate.isPending}
        postPending={postRun.isPending}
        onSelectRun={setSelectedRunId}
        onCreate={(input) => createRun.mutate(input)}
        onRecalculate={(runId) => recalculate.mutate(runId)}
        onPost={(runId) => postRun.mutate(runId)}
      />
    </section>
  );
}

function GoldProductionPanel({
  workPeriod,
  locations,
  entries,
  pending,
  onCreate,
}: {
  workPeriod: WorkPeriod;
  locations: ReferenceDataItem[];
  entries: Array<{
    id: string;
    locationLabel?: string;
    locationId: string;
    productionDate: string;
    goldGramsProduced: number;
    notes?: string;
  }>;
  pending: boolean;
  onCreate: (input: {
    locationId: string;
    productionDate: string;
    goldGramsProduced: number;
    notes?: string;
  }) => void;
}) {
  const [locationId, setLocationId] = useState("");
  const [grams, setGrams] = useState("");
  const [notes, setNotes] = useState("");
  const [validation, setValidation] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setValidation("");
    const value = Number(grams);
    if (!locationId) return setValidation("Select the well/location.");
    if (!Number.isFinite(value) || value <= 0)
      return setValidation("Gold produced must be greater than zero.");
    if (!/^\d+(?:\.\d{1,8})?$/.test(grams.trim()))
      return setValidation("Gold produced supports at most 8 decimal places.");
    onCreate({
      locationId,
      productionDate: workPeriod.workDate,
      goldGramsProduced: value,
      notes: notes.trim(),
    });
    setGrams("");
    setNotes("");
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
      >
        <div>
          <h3 className="font-semibold">Gold Production</h3>
          <p className="text-sm text-gray-500">
            Enter production for the well used by commission calculations.
          </p>
        </div>
        {validation && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {validation}
          </div>
        )}
        <label className="block text-sm font-medium text-gray-700">
          Well / Location *
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">Select a well</option>
            {locations.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Gold produced (grams) *
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            type="number"
            min="0.00000001"
            step="0.00000001"
            value={grams}
            onChange={(event) => setGrams(event.target.value)}
            placeholder="12.12345678"
          />
        </label>
        <label className="block text-sm font-medium text-gray-700">
          Notes
          <textarea
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </label>
        <button
          disabled={pending}
          className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Saving..." : "Add Production"}
        </button>
      </form>
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Recorded Production</h3>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            No gold production has been recorded for this Work Period.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {entries.map((entry) => (
              <article key={entry.id} className="rounded-xl border p-3">
                <div className="flex items-center justify-between gap-3">
                  <strong>{entry.locationLabel || entry.locationId}</strong>
                  <span className="font-mono text-sm">
                    {entry.goldGramsProduced.toFixed(8)} g
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {entry.productionDate}
                  {entry.notes ? ` · ${entry.notes}` : ""}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AccrualRunPanel({
  workPeriod,
  runs,
  selectedRun,
  items,
  loading,
  createPending,
  recalculatePending,
  postPending,
  onSelectRun,
  onCreate,
  onRecalculate,
  onPost,
}: {
  workPeriod: WorkPeriod;
  runs: AccrualRun[];
  selectedRun?: AccrualRun;
  items: AccrualItem[];
  loading: boolean;
  createPending: boolean;
  recalculatePending: boolean;
  postPending: boolean;
  onSelectRun: (id: string) => void;
  onCreate: (input: { accrualDate: string; notes?: string }) => void;
  onRecalculate: (id: string) => void;
  onPost: (id: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const create = () =>
    onCreate({ accrualDate: workPeriod.workDate, notes: notes.trim() });
  const canPost = Boolean(
    selectedRun &&
    selectedRun.summary.readyItems > 0 &&
    selectedRun.status !== "POSTED" &&
    selectedRun.status !== "VOIDED",
  );

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="font-semibold">Accrual Runs</h3>
          <p className="text-sm text-gray-500">
            Calculation is repeatable; posting only affects READY items.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Accrual notes"
            className="rounded-xl border px-3 py-2 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional run notes"
          />
          <button
            onClick={create}
            disabled={createPending || workPeriod.status === "CLOSED"}
            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {createPending ? "Calculating..." : "Run Accrual"}
          </button>
        </div>
      </div>
      {runs.length > 0 && (
        <label className="block text-sm font-medium text-gray-700">
          Accrual Run
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={selectedRun?.id ?? ""}
            onChange={(event) => onSelectRun(event.target.value)}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.accrualDate} · {humanizePlanningCode(run.status)} ·{" "}
                {run.summary.totalItems} items
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedRun && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Summary label="Total" value={selectedRun.summary.totalItems} />
            <Summary label="Ready" value={selectedRun.summary.readyItems} />
            <Summary label="Pending" value={selectedRun.summary.pendingItems} />
            <Summary label="Posted" value={selectedRun.summary.postedItems} />
            <Summary label="Skipped" value={selectedRun.summary.skippedItems} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onRecalculate(selectedRun.id)}
              disabled={
                recalculatePending ||
                selectedRun.status === "POSTED" ||
                selectedRun.status === "VOIDED"
              }
              className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {recalculatePending ? "Recalculating..." : "Recalculate"}
            </button>
            <button
              onClick={() => onPost(selectedRun.id)}
              disabled={!canPost || postPending}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {postPending ? "Posting..." : "Post Ready Items"}
            </button>
          </div>
        </>
      )}
      {loading ? (
        <p className="text-sm text-gray-500">Loading accrual items...</p>
      ) : (
        <AccrualItemsTable items={items} />
      )}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function AccrualItemsTable({ items }: { items: AccrualItem[] }) {
  if (items.length === 0)
    return (
      <p className="text-sm text-gray-500">No accrual items for this run.</p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
            <th className="px-2 py-3">Collaborator</th>
            <th className="px-2 py-3">Rule</th>
            <th className="px-2 py-3">Direction</th>
            <th className="px-2 py-3">BRL</th>
            <th className="px-2 py-3">Gold</th>
            <th className="px-2 py-3">Status</th>
            <th className="px-2 py-3">Pending reason</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="px-2 py-3 font-medium">
                {item.collaboratorName || item.collaboratorId}
              </td>
              <td className="px-2 py-3">
                {humanizePlanningCode(item.calculationType)}
              </td>
              <td className="px-2 py-3">{item.direction}</td>
              <td className="px-2 py-3">
                {item.brlAmount === undefined ? "—" : item.brlAmount.toFixed(2)}
              </td>
              <td className="px-2 py-3 font-mono">
                {item.goldGramAmount === undefined
                  ? "—"
                  : `${item.goldGramAmount.toFixed(8)} g`}
              </td>
              <td className="px-2 py-3">
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">
                  {item.status}
                </span>
              </td>
              <td className="px-2 py-3 text-gray-500">
                {item.pendingReason
                  ? humanizePlanningCode(item.pendingReason)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
