import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
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
  const { t } = useTranslation("planning");
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
        <h2 className="text-lg font-semibold">{t("accrual.title")}</h2>
        <p className="text-sm text-gray-500">
          {t("accrual.description")}
        </p>
      </div>
      <ApiErrorPanel error={error} />
      <GoldProductionPanel
        workPeriod={workPeriod}
        entries={productionQuery.data?.items ?? []}
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
  entries,
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
}) {
  const { t } = useTranslation("planning");
  const totalProduced = entries.reduce(
    (sum, entry) => sum + entry.goldGramsProduced,
    0,
  );
  const manageHref = `/gold-production?workPeriodId=${encodeURIComponent(workPeriod.id)}`;

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">{t("accrual.goldProducedTitle")}</h3>
          <p className="text-sm text-gray-500">
            {t("accrual.goldProducedDescription")}
          </p>
        </div>
        <Link
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          to={manageHref}
        >
          {t("accrual.openGoldProduction")}
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t("accrual.emptyGoldProduction")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {t("accrual.totalGoldProduced")}
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
  onCreate: (input: { accrualDate: string; notes?: string }) => void;
  onRecalculate: (id: string) => void;
  onPost: (id: string) => void;
}) {
  const { t } = useTranslation("planning");
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
          <h3 className="font-semibold">{t("accrual.accrualRunsTitle")}</h3>
          <p className="text-sm text-gray-500">
            {t("accrual.accrualRunsDescription")}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            aria-label="Accrual notes"
            className="rounded-xl border px-3 py-2 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={t("accrual.accrualNotesPlaceholder")}
          />
          <button
            onClick={create}
            disabled={createPending || workPeriod.status === "CLOSED"}
            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {createPending ? t("accrual.calculatingButton") : t("accrual.runAccrualButton")}
          </button>
        </div>
      </div>
      {runs.length > 0 && (
        <label className="block text-sm font-medium text-gray-700">
          {t("accrual.accrualRunLabel")}
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={selectedRun?.id ?? ""}
            onChange={(event) => onSelectRun(event.target.value)}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {run.accrualDate} · {humanizePlanningCode(run.status, t)} ·{" "}
                {run.summary.totalItems} items
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedRun && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Summary label={t("accrual.summaryTotal")} value={selectedRun.summary.totalItems} />
            <Summary label={t("accrual.summaryReady")} value={selectedRun.summary.readyItems} />
            <Summary label={t("accrual.summaryPending")} value={selectedRun.summary.pendingItems} />
            <Summary label={t("accrual.summaryPosted")} value={selectedRun.summary.postedItems} />
            <Summary label={t("accrual.summarySkipped")} value={selectedRun.summary.skippedItems} />
          </div>
          {selectedRun.summary.postedItems > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <strong>{t("accrual.postedMessage")}</strong>{" "}
              {t("accrual.postedMessageDetails")}
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
              {recalculatePending ? t("accrual.recalculatingButton") : t("accrual.recalculateButton")}
            </button>
            <button
              onClick={() => onPost(selectedRun.id)}
              disabled={!canPost || postPending}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {postPending ? t("accrual.postingButton") : t("accrual.postReadyButton")}
            </button>
          </div>
        </>
      )}
      {loading ? (
        <p className="text-sm text-gray-500">{t("accrual.loadingItems")}</p>
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
  const { t } = useTranslation("planning");
  if (items.length === 0)
    return (
      <p className="text-sm text-gray-500">{t("accrual.emptyItems")}</p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
            <th className="px-2 py-3">{t("accrual.tableCollaborator")}</th>
            <th className="px-2 py-3">{t("accrual.tableRule")}</th>
            <th className="px-2 py-3">{t("accrual.tableDirection")}</th>
            <th className="px-2 py-3">{t("accrual.tableBrl")}</th>
            <th className="px-2 py-3">{t("accrual.tableGold")}</th>
            <th className="px-2 py-3">{t("accrual.tableStatus")}</th>
            <th className="px-2 py-3">{t("accrual.tablePendingReason")}</th>
            <th className="px-2 py-3">{t("accrual.tableLedgerVisibility")}</th>
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
                  ? humanizePlanningCode(item.pendingReason, t)
                  : "—"}
              </td>
              <td className="px-2 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-gray-600">
                    {ledgerVisibilityLabel(item, t)}
                  </span>
                  <a
                    className="text-sm font-semibold text-gray-900 underline"
                    href={currentAccountHref(item)}
                  >
                    {item.status === "POSTED"
                      ? t("accrual.viewCurrentAccount")
                      : t("accrual.openCurrentAccount")}
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

function ledgerVisibilityLabel(item: AccrualItem, t: TFunction<"planning">) {
  if (item.status === "POSTED") {
    return isAssignmentEarning(item)
      ? t("accrual.ledgerPostedEarning")
      : t("accrual.ledgerPostedEntry");
  }
  if (item.status === "READY") return t("accrual.ledgerReady");
  if (item.status === "PENDING") return t("accrual.ledgerPending");
  return humanizePlanningCode(item.status, t);
}

function isAssignmentEarning(item: AccrualItem) {
  return (
    item.direction === "CREDIT" &&
    Boolean(item.workPeriodAssignmentId) &&
    !item.calculationType.toUpperCase().includes("REPLACEMENT")
  );
}
