import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import { useI18n, translateEnglish, type Translate } from "../../i18n";
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
  const { t } = useI18n();
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
        <h2 className="text-lg font-semibold">{t("accrual.title")}</h2>
        <p className="text-sm text-gray-500">
          {t("accrual.subtitle")}
        </p>
      </div>
      <ApiErrorPanel error={error} translate={t} />
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
}) {  const { t, formatDate, formatNumber } = useI18n();

  const totalProduced = entries.reduce(
    (sum, entry) => sum + entry.goldGramsProduced,
    0,
  );
  const manageHref = `/gold-production?workPeriodId=${encodeURIComponent(workPeriod.id)}`;

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-semibold">{t("accrual.goldProduced")}</h3>
          <p className="text-sm text-gray-500">
            {t("accrual.goldHelp")}
          </p>
        </div>
        {canManage ? (
          <Link
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            to={manageHref}
          >
            {t("accrual.openGold")}
          </Link>
        ) : null}
      </div>
      {entries.length === 0 ? (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {t("accrual.noGold")}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl bg-gray-50 p-3">
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {t("accrual.totalGold")}
            </div>
            <div className="mt-1 font-mono text-xl font-bold">
              {formatNumber(totalProduced, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} g
            </div>
          </div>
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-3">
                <strong>{entry.locationLabel || entry.locationId}</strong>
                <span className="font-mono text-sm">
                  {formatNumber(entry.goldGramsProduced, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} g
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {formatDate(entry.productionDate)}
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
}) {  const { t, formatDate } = useI18n();

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
        <h3 className="font-semibold">{t("accrual.runs")}</h3>
        <p className="text-sm text-gray-500">
          {t("accrual.runsHelp")}
        </p>
      </div>
      <div className="rounded-xl border bg-gray-50 p-4">
        <label
          className="block text-sm font-semibold text-gray-800"
          htmlFor="accrual-run-notes"
        >
          {t("accrual.notes")}
        </label>
        <p id="accrual-run-notes-help" className="mt-1 text-xs text-gray-500">
          {workPeriod.status === "CLOSED"
            ? t("accrual.closedHelp")
            : hasActiveRun
              ? t("accrual.activeHelp")
              : t("accrual.notesHelp")}
        </p>
        <textarea
          id="accrual-run-notes"
          aria-label={t("accrual.notes")}
          aria-describedby="accrual-run-notes-help"
          className="mt-3 min-h-24 w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm disabled:bg-gray-100 disabled:text-gray-500"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t("accrual.notesPlaceholder")}
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
            {createPending ? t("accrual.calculating") : t("accrual.run")}
          </button>
        </div>
      </div>
      {runs.length > 0 && (
        <label className="block text-sm font-medium text-gray-700">
          {t("accrual.runLabel")}
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={selectedRun?.id ?? ""}
            onChange={(event) => onSelectRun(event.target.value)}
          >
            {runs.map((run) => (
              <option key={run.id} value={run.id}>
                {formatDate(run.accrualDate)} · {humanizePlanningCode(run.status, t)} ·{" "}
                {t("accrual.items", { count: run.summary.totalItems })}
              </option>
            ))}
          </select>
        </label>
      )}
      {selectedRun && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Summary label={t("accrual.total")} value={selectedRun.summary.totalItems} />
            <Summary label={t("accrual.ready")} value={selectedRun.summary.readyItems} />
            <Summary label={t("accrual.pending")} value={selectedRun.summary.pendingItems} />
            <Summary label={t("accrual.posted")} value={selectedRun.summary.postedItems} />
            <Summary label={t("accrual.skipped")} value={selectedRun.summary.skippedItems} />
          </div>
          {selectedRun.summary.postedItems > 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <strong>{t("accrual.postedHelp")}</strong>
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
              {recalculatePending ? t("accrual.recalculating") : t("accrual.recalculate")}
            </button>
            <button
              onClick={() => onPost(selectedRun.id)}
              disabled={!canPost || postPending}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {postPending ? t("accrual.posting") : t("accrual.postReady")}
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
  const { t, formatNumber } = useI18n();
  if (items.length === 0)
    return (
      <p className="text-sm text-gray-500">{t("accrual.noItems")}</p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b text-xs uppercase tracking-wide text-gray-500">
            <th className="px-2 py-3">{t("common.collaborator")}</th>
            <th className="px-2 py-3">{t("accrual.rule")}</th>
            <th className="px-2 py-3">{t("accrual.direction")}</th>
            <th className="px-2 py-3">BRL</th>
            <th className="px-2 py-3">{t("accrual.gold")}</th>
            <th className="px-2 py-3">{t("common.status")}</th>
            <th className="px-2 py-3">{t("accrual.pendingReason")}</th>
            <th className="px-2 py-3">{t("accrual.ledgerVisibility")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b last:border-0">
              <td className="px-2 py-3 font-medium">
                <div>{item.collaboratorName || item.collaboratorId}</div>
                <dl className="mt-1 grid gap-0.5 text-xs font-normal text-gray-500">
                  <div>
                    <dt className="inline font-semibold text-gray-600">{t("accrual.personOwner")}: </dt>
                    <dd className="inline font-mono">{item.personId}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-gray-600">{t("accrual.journeyProvenance")}: </dt>
                    <dd className="inline font-mono">{item.collaboratorId}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-gray-600">{t("common.tenant")}: </dt>
                    <dd className="inline font-mono">{item.tenantId}</dd>
                  </div>
                </dl>
              </td>
              <td className="px-2 py-3">
                {humanizePlanningCode(item.calculationType, t)}
              </td>
              <td className="px-2 py-3">{item.direction === "CREDIT" ? t("common.credit") : item.direction === "DEBIT" ? t("common.debit") : item.direction}</td>
              <td className="px-2 py-3">
                {item.brlAmount === undefined ? "—" : formatNumber(item.brlAmount, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="px-2 py-3 font-mono">
                {item.goldGramAmount === undefined
                  ? "—"
                  : `${formatNumber(item.goldGramAmount, { minimumFractionDigits: 0, maximumFractionDigits: 8 })} g`}
              </td>
              <td className="px-2 py-3">
                <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold">
                  {humanizePlanningCode(item.status, t)}
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
                      ? t("accrual.viewCurrent")
                      : t("accrual.openCurrent")}
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

function ledgerVisibilityLabel(item: AccrualItem, t: Translate = translateEnglish) {
  if (item.status === "POSTED") {
    return isAssignmentEarning(item)
      ? t("accrual.postedEarning")
      : t("accrual.postedEntry");
  }
  if (item.status === "READY") return t("accrual.readyPost");
  if (item.status === "PENDING") return t("accrual.waitingInput");
  return humanizePlanningCode(item.status, t);
}

function isAssignmentEarning(item: AccrualItem) {
  return (
    item.direction === "CREDIT" &&
    Boolean(item.workPeriodAssignmentId) &&
    !item.calculationType.toUpperCase().includes("REPLACEMENT")
  );
}
