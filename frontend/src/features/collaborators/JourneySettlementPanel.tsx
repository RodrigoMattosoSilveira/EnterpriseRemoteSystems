import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  confirmRecentReauthentication,
  loadRecentReauthentication,
  type RecentReauthentication,
} from "../../app/reauthStore";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { SettlementPreview } from "../../types/settlements";
import {
  useCloseJourney,
  usePartialPayout,
  useSettlementPreview,
  useZeroGold,
} from "./useSettlements";

type Action = "ZERO_GOLD" | "PARTIAL_PAYOUT" | "CLOSE_JOURNEY";

const correctionReasonOptions = [
  {
    value: "GOLD_ZEROING_CORRECTION",
    label: "Gold zeroing correction",
    actions: ["ZERO_GOLD"] satisfies Action[],
  },
  {
    value: "PAYOUT_CORRECTION",
    label: "Payout correction",
    actions: ["PARTIAL_PAYOUT", "CLOSE_JOURNEY"] satisfies Action[],
  },
  {
    value: "JOURNEY_SETTLEMENT_ADJUSTMENT",
    label: "Journey settlement adjustment",
    actions: ["CLOSE_JOURNEY"] satisfies Action[],
  },
  {
    value: "MANUAL_CORRECTION",
    label: "Manual correction",
    actions: [
      "ZERO_GOLD",
      "PARTIAL_PAYOUT",
      "CLOSE_JOURNEY",
    ] satisfies Action[],
  },
];

export function JourneySettlementPanel({
  collaboratorId,
  projectedEndDate,
}: {
  collaboratorId: string;
  projectedEndDate: string;
}) {
  const preview = useSettlementPreview(collaboratorId);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [receiptEntryIds, setReceiptEntryIds] = useState<string[]>([]);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Journey Settlement
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Preview balances, pay outstanding credits, or close the Journey.
          </p>
          <JourneyDaysRemaining
            projectedEndDate={projectedEndDate}
            className="mt-1 block text-sm"
          />
        </div>
        <button
          type="button"
          className="rounded-xl border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm"
          onClick={() => preview.refetch()}
        >
          Refresh
        </button>
      </div>

      {preview.isLoading ? (
        <p className="mt-4 text-sm text-gray-600">
          Loading settlement preview...
        </p>
      ) : null}
      {preview.error ? (
        <div className="mt-4">
          <ApiErrorPanel error={preview.error} />
        </div>
      ) : null}
      {message ? (
        <p
          role="status"
          className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-800"
        >
          {message}
        </p>
      ) : null}
      {receiptEntryIds.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {receiptEntryIds.map((entryId, index) => (
            <Link
              key={entryId}
              className="text-sm font-semibold text-gray-800 underline"
              target="_blank"
              to={`/ledger-entries/${entryId}/receipt`}
            >
              Print receipt{receiptEntryIds.length > 1 ? ` ${index + 1}` : ""}
            </Link>
          ))}
        </div>
      ) : null}

      {preview.data ? (
        <>
          <PreviewSummary preview={preview.data} />
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={preview.data.goldGramBalance <= 0}
              onClick={() => setAction("ZERO_GOLD")}
            >
              Zero Gold
            </button>
            <button
              type="button"
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setAction("PARTIAL_PAYOUT")}
            >
              Partial Payout
            </button>
            <button
              type="button"
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!preview.data.canClose}
              onClick={() => setAction("CLOSE_JOURNEY")}
            >
              Close Journey
            </button>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Settlement actions use the current authorization actor selected in
            Authz Admin. Operators should not handle backend settlement secrets.
          </p>
        </>
      ) : null}

      {action && preview.data ? (
        <SettlementActionPanel
          action={action}
          collaboratorId={collaboratorId}
          preview={preview.data}
          onClose={() => setAction(null)}
          onSuccess={(text, entryIds) => {
            setMessage(text);
            setReceiptEntryIds(entryIds);
            setAction(null);
          }}
        />
      ) : null}
    </section>
  );
}

function PreviewSummary({ preview }: { preview: SettlementPreview }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Summary label="BRL balance" value={formatBRL(preview.brlBalance)} />
      <Summary
        label="Gold balance"
        value={`${formatGold(preview.goldGramBalance)} g`}
      />
      <Summary
        label="Pending accruals"
        value={String(preview.pendingAccrualItems)}
      />
      <Summary label="Can close" value={preview.canClose ? "Yes" : "No"} />
      {preview.blockingReasons.length > 0 ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2 lg:col-span-4">
          <span className="font-semibold">Blocking reasons:</span>{" "}
          {preview.blockingReasons.map(formatReason).join(", ")}
        </div>
      ) : null}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-gray-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-gray-950">{value}</p>
    </div>
  );
}

function SettlementActionPanel({
  action,
  collaboratorId,
  preview,
  onClose,
  onSuccess,
}: {
  action: Action;
  collaboratorId: string;
  preview: SettlementPreview;
  onClose: () => void;
  onSuccess: (message: string, ledgerEntryIds: string[]) => void;
}) {
  const zeroGold = useZeroGold(collaboratorId);
  const payout = usePartialPayout(collaboratorId);
  const closeJourney = useCloseJourney(collaboratorId);
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [brlAmount, setBrlAmount] = useState("");
  const [goldAmount, setGoldAmount] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [notes, setNotes] = useState("");
  const [reauthentication, setReauthentication] =
    useState<RecentReauthentication | null>(() => loadRecentReauthentication());
  const mutation =
    action === "ZERO_GOLD"
      ? zeroGold
      : action === "PARTIAL_PAYOUT"
        ? payout
        : closeJourney;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const recentReauthentication = loadRecentReauthentication();
    setReauthentication(recentReauthentication);
    if (!recentReauthentication) return;

    const base = {
      effectiveDate,
      reasonCode,
      reasonText,
      notes,
      requestId: crypto.randomUUID(),
    };
    if (action === "ZERO_GOLD") {
      const result = await zeroGold.mutateAsync(base);
      onSuccess("Gold payout posted successfully.", [result.ledgerEntry.id]);
      return;
    }
    if (action === "PARTIAL_PAYOUT") {
      const result = await payout.mutateAsync({
        ...base,
        brlAmount: Number(brlAmount || 0),
        goldGramAmount: Number(goldAmount || 0),
      });
      onSuccess(
        "Partial payout posted successfully.",
        result.ledgerEntries.map((entry) => entry.id),
      );
      return;
    }
    const result = await closeJourney.mutateAsync({ ...base, confirm: true });
    onSuccess(
      "Journey closed successfully.",
      result.ledgerEntries.map((entry) => entry.id),
    );
  }

  return (
    <div
      role="region"
      aria-labelledby="settlement-action-panel-title"
      className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-inner"
    >
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3
              id="settlement-action-panel-title"
              className="text-lg font-bold text-gray-950"
            >
              {actionTitle(action)}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {actionDescription(action, preview)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="text-2xl text-gray-500"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          {action === "PARTIAL_PAYOUT" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="BRL amount">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={brlAmount}
                  onChange={(event) => setBrlAmount(event.target.value)}
                />
              </Field>
              <Field label="Gold grams">
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.00000001"
                  value={goldAmount}
                  onChange={(event) => setGoldAmount(event.target.value)}
                />
              </Field>
            </div>
          ) : null}
          <Field label="Effective date">
            <input
              required
              className={inputClass}
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </Field>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">Authorization actor</p>
            <p className="mt-1">
              This action uses the current request actor selected in Authz Admin.
              Backend settlement keys are not entered by operators or testers.
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Correction reason required</p>
            <p className="mt-1">
              Sensitive settlement operations must capture a structured reason
              code and a human-readable reason before they can be submitted.
            </p>
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Recent reauthentication required</p>
                <p className="mt-1">
                  Confirm the operator has recently reauthenticated before
                  submitting this sensitive operation. This development control
                  supplies the required backend reauthentication headers.
                </p>
                {reauthentication ? (
                  <p className="mt-2 text-xs font-semibold">
                    Confirmed at {formatDateTime(reauthentication.reauthenticatedAt)}
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold">
                    Not confirmed for this browser session.
                  </p>
                )}
              </div>
              <button
                type="button"
                className="rounded-xl bg-purple-900 px-3 py-2 text-sm font-semibold text-white"
                onClick={() => setReauthentication(confirmRecentReauthentication())}
              >
                Confirm reauthentication
              </button>
            </div>
          </div>
          <Field label="Reason code">
            <select
              required
              className={inputClass}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              <option value="">Select a reason code</option>
              {correctionReasonOptions
                .filter((option) => option.actions.includes(action))
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Reason text">
            <textarea
              required
              className={inputClass}
              rows={3}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              placeholder="Explain why this sensitive correction is needed."
            />
          </Field>
          <Field label="Notes">
            <textarea
              className={inputClass}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          {mutation.error ? <ApiErrorPanel error={mutation.error} /> : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !reauthentication}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {mutation.isPending
                ? "Processing..."
                : !reauthentication
                  ? "Confirm reauthentication first"
                  : actionButton(action)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm font-medium text-gray-700">
      <span>{label}</span>
      {children}
    </label>
  );
}
const inputClass =
  "rounded-xl border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10";
function actionTitle(action: Action) {
  return action === "ZERO_GOLD"
    ? "Zero Gold Balance"
    : action === "PARTIAL_PAYOUT"
      ? "Partial Payout"
      : "Close Journey";
}
function actionButton(action: Action) {
  return action === "ZERO_GOLD"
    ? "Post Gold Payout"
    : action === "PARTIAL_PAYOUT"
      ? "Post Payout"
      : "Close Journey";
}
function actionDescription(action: Action, preview: SettlementPreview) {
  if (action === "ZERO_GOLD")
    return `Pay the full positive gold balance of ${formatGold(preview.goldGramBalance)} g.`;
  if (action === "PARTIAL_PAYOUT")
    return "Pay part of the available BRL and/or gold balance.";
  return "Pay all remaining positive balances and mark this Journey finished.";
}
function formatReason(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
function formatGold(value: number) {
  return value.toFixed(8);
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
