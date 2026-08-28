import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { WorkPeriod } from "../../types/planning";
import type { ReferenceDataItem } from "../../types/referenceData";
import type { AccrualItem, AccrualRun } from "../../types/accruals";
import { humanizePlanningCode } from "./planningSchemas";
import {
  useAccrualItems,
  useAccrualRuns,
  useCreateAccrualRun,
  useGoldProductionEntries,
  usePostAccrualRun,
  useRecalculateAccrualRun,
} from "./useAccruals";

export function AccrualTab({
  workPeriod,
}: {
  workPeriod: WorkPeriod;
  locations: ReferenceDataItem[];
}) {
  const actor = useAuthorizationContext();
  const canManageGoldProduction =
    actor.permissions.includes("*") ||
    actor.permissions.includes("gold_production.manage");
  const runsQuery = useAccrualRuns(workPeriod.id);
  const productionQuery = useGoldProductionEntries(workPeriod.id);
  const createRun = useCreateAccrualRun(workPeriod.id);
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
    recalculate.error ||
    postRun.error;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Accrual</h2>
        <p className="text-sm text-gray-500">
          Review recorded well production, calculate collaborator earnings,
          review pending items, and post ready credits.
        </p>
      </div>
      <ApiErrorPanel error={error} />
      <GoldProductionPanel
        workPeriod={workPeriod}
        entries={productionQuery.data?.items ?? []}
        canManage={canManageGoldProduction}
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
        onCreate={async (input) => {
          await createRun.mutateAsync(input);
        }}
        onRecalculate={(runId) => recalculate.mutate(runId)}
        onPost={(runId) => postRun.mutate(runId)}
      />
    </section>
  );
}

function GoldProductionPanel({
  workPeriod,
  entries,
  canManage,
}: {
  workPeriod: WorkPeriod;
  entries: Array<{
    id: string;
    locationLabel?: string;
    locationId: string;
    productionDate: string;
    goldGramsProduced: number;
    notes?: string;
  }>;
  canManage: boolean;
}) {
  const totalProduced = entries.reduce(
    (sum, entry) => sum + entry.goldGramsProduced,
    0,
  );
  const manageHref = `/gold-production?workPeriodId=${encodeURIComponent(workPeriod.id)}`;

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">Gold Produced</h3>
          <p className="text-sm text-gray-500">
            Gold Produced is read-only in Accrual. Authorized actors must use
            the Gold Production workflow to create or edit mine production.
          </p>
        </div>
        {canManage ? (
          <Link
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            to={manageHref}
          >
            Open Gold Production
          </Link>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          No gold production has been recorded for this Work Period. Commission
          accrual items that require production will remain pending until an
          authorized actor records it in Gold Production.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              Total gold produced
            </div>
            <div className="mt-1 font-mono text-xl font-bold">
              {totalProduced.toFixed(8)} g
            </div>
          </div>
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
  onCreate: (input: { accrualDate: string; notes?: string }) => Promise<void>;
  onRecalculate: (id: string) => void;
  onPost: (id: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const hasActiveRun = runs.some(
    (run) => run.status !== "POSTED" && run.status !== "VOIDED",
  );
  const hasRequiredNotes = notes.trim().length > 0;
  const canCreate =
    hasRequiredNotes &&
    !hasActiveRun &&
    !createPending &&
    workPeriod.status !== "CLOSED";
  const create = async () => {
    if (!canCreate) return;
    try {
      await onCreate({ accrualDate: workPeriod.workDate, notes: notes.trim() });
      setNotes("");
    } catch {
      // Mutation errors are surfaced by ApiErrorPanel. Preserve notes for retry.
    }
  };
  const canPost = Boolean(
    selectedRun &&
    selectedRun.summary.readyItems > 0 &&
    selectedRun.status !== "POSTED" &&
    selectedRun.status !== "VOIDED",
  );

  return (
    <div className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-semibold">Accrual Runs</h3>
        <p className="text-sm text-gray-500">
          Calculation is repeatable; posting only affects READY items.
        </p>
      </div>
      <div className="rounded-xl border bg-gray-50 p-4">
        <label
          className="block text-sm font-semibold text-gray-800"
          htmlFor="accrual-run-notes"
        >
          Accrual notes
        </label>
        <p id="accrual-run-notes-help" className="mt-1 text-xs text-gray-500">
          {workPeriod.status === "CLOSED"
            ? "Closed Work Periods cannot create accrual runs."
            : hasActiveRun
              ? "An unposted accrual run already exists. Recalculate or post that run before creating another one."
              : "Required. Describe the reason or scope of this accrual run. Notes are cleared after a successful run."}
        </p>
        <textarea
          id="accrual-run-notes"
          aria-label="Accrual notes"
          aria-describedby="accrual-run-notes-help"
          className="mt-3 min-h-24 w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Example: Final Tenant B accrual after reviewing actual outcomes."
          required
          disabled={createPending || hasActiveRun || workPeriod.status === "CLOSED"}
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={() => void create()}
            disabled={!canCreate}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${
              canCreate
                ? "bg-gray-950 text-white"
                : "cursor-not-allowed bg-gray-200 text-gray-500"
            }`}
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
          {selectedRun.summary.postedItems > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <strong>Posted items are now visible in Current Accounts.</strong>{" "}
              Use the row links below to verify each posted earning credit or
              transfer in the collaborator ledger.
            </div>
          ) : null}
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
            <th className="px-2 py-3">Ledger visibility</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="px-2 py-3 font-medium">
                <div>{item.collaboratorName || item.collaboratorId}</div>
                <dl className="mt-1 grid gap-0.5 text-xs font-normal text-gray-500">
                  <div>
                    <dt className="inline font-semibold text-gray-600">Person owner: </dt>
                    <dd className="inline font-mono">{item.personId}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-gray-600">Journey provenance: </dt>
                    <dd className="inline font-mono">{item.collaboratorId}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-gray-600">Tenant: </dt>
                    <dd className="inline font-mono">{item.tenantId}</dd>
                  </div>
                </dl>
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
              <td className="px-2 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-600">
                    {ledgerVisibilityLabel(item)}
                  </span>
                  <a
                    className="text-sm font-semibold text-gray-900 underline"
                    href={currentAccountHref(item)}
                  >
                    {item.status === "POSTED"
                      ? "View in Current Account"
                      : "Open Current Account"}
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function currentAccountHref(item: AccrualItem) {
  const base = `/collaborators/${encodeURIComponent(item.collaboratorId)}/current-account`;
  return isAssignmentEarning(item) ? `${base}?filter=earnings` : base;
}

function ledgerVisibilityLabel(item: AccrualItem) {
  if (item.status === "POSTED") {
    return isAssignmentEarning(item)
      ? "Posted earning credit"
      : "Posted ledger entry";
  }
  if (item.status === "READY") return "Ready to post";
  if (item.status === "PENDING") return "Waiting for input";
  return humanizePlanningCode(item.status);
}

function isAssignmentEarning(item: AccrualItem) {
  return (
    item.direction === "CREDIT" &&
    Boolean(item.workPeriodAssignmentId) &&
    !item.calculationType.toUpperCase().includes("REPLACEMENT")
  );
}
