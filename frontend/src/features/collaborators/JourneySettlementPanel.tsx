import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  confirmRecentReauthentication,
  loadRecentReauthentication,
  type RecentReauthentication,
} from "../../app/reauthStore";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { AuthzActor, AuthzAdminRequestActor } from "../../types/authz";
import type { SettlementPreview, SecondApprovalInput } from "../../types/settlements";
import { useAuthzActors } from "../authz/useAuthzAdmin";
import { useSecondPersonApprovalPolicy } from "../current-accounts/useSecondPersonApprovalPolicy";
import {
  useCloseJourney,
  usePartialPayout,
  useSettlementPreview,
  useZeroGold,
} from "./useSettlements";

type Action = "ZERO_GOLD" | "PARTIAL_PAYOUT" | "CLOSE_JOURNEY";

const AUTHZ_REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";

const defaultRequestActor: AuthzAdminRequestActor = {
  actorId: "bootstrap-admin",
  tenantId: "default",
};

const settlementReasonOptions: Array<{
  value: string;
  label: string;
  actions: Action[];
}> = [
  {
    value: "GOLD_BALANCE_PAYOUT",
    label: "Gold balance payout",
    actions: ["ZERO_GOLD"] satisfies Action[],
  },
  {
    value: "COLLABORATOR_REQUESTED_PAYOUT",
    label: "Collaborator requested payout",
    actions: ["PARTIAL_PAYOUT"] satisfies Action[],
  },
  {
    value: "SCHEDULED_PAYOUT",
    label: "Scheduled payout",
    actions: ["PARTIAL_PAYOUT"] satisfies Action[],
  },
  {
    value: "END_OF_JOURNEY_SETTLEMENT",
    label: "End-of-journey settlement",
    actions: ["CLOSE_JOURNEY"] satisfies Action[],
  },
  {
    value: "FINAL_BALANCE_PAYOUT",
    label: "Final balance payout",
    actions: ["CLOSE_JOURNEY"] satisfies Action[],
  },
];

export function JourneySettlementPanel({
  collaboratorId,
  projectedEndDate,
  closedAt = "",
}: {
  collaboratorId: string;
  projectedEndDate: string;
  closedAt?: string;
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
            closedAt={closedAt}
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
  const [requestActor] = useState<AuthzAdminRequestActor>(() =>
    loadRequestActor(),
  );
  const secondApprovalPolicy = useSecondPersonApprovalPolicy(requestActor);
  const actorsQuery = useAuthzActors(requestActor);
  const [captureOptionalSecondApproval, setCaptureOptionalSecondApproval] =
    useState(false);
  const [secondApprovedBy, setSecondApprovedBy] = useState("");
  const [secondApprovalNotes, setSecondApprovalNotes] = useState("");
  const secondApprovalRequired = Boolean(secondApprovalPolicy.data?.required);
  const secondApprovalEnabled =
    secondApprovalRequired || captureOptionalSecondApproval;
  const eligibleSecondApprovers = (actorsQuery.data ?? []).filter((actor) =>
    isEligibleSecondApprover(actor, requestActor.actorId),
  );
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

    const secondApproval = buildSecondApproval(
      secondApprovalEnabled,
      secondApprovedBy,
      secondApprovalNotes,
    );
    if (secondApprovalEnabled && !secondApproval) return;

    const base = {
      effectiveDate,
      reasonCode,
      reasonText,
      notes,
      requestId: crypto.randomUUID(),
      ...(secondApproval ? { secondApproval } : {}),
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
        goldGramAmount: parseGoldInputAmount(goldAmount),
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
                  step="0.01"
                  inputMode="decimal"
                  value={goldAmount}
                  onChange={(event) => setGoldAmount(event.target.value)}
                  onBlur={(event) =>
                    setGoldAmount(formatGoldInputValue(event.target.value))
                  }
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
            <p className="font-semibold">Settlement reason required</p>
            <p className="mt-1">
              Sensitive settlement operations must capture an action-specific
              reason code and a human-readable reason before they can be submitted.
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
          <SecondApprovalCapture
            actor={requestActor}
            actors={eligibleSecondApprovers}
            isLoadingPolicy={secondApprovalPolicy.isLoading}
            isLoadingActors={actorsQuery.isLoading}
            policyRequired={secondApprovalRequired}
            captureOptional={captureOptionalSecondApproval}
            approvedBy={secondApprovedBy}
            notes={secondApprovalNotes}
            onToggleOptional={(checked) => {
              setCaptureOptionalSecondApproval(checked);
              if (!checked && !secondApprovalRequired) {
                setSecondApprovedBy("");
                setSecondApprovalNotes("");
              }
            }}
            onApprovedByChange={setSecondApprovedBy}
            onNotesChange={setSecondApprovalNotes}
          />

          <Field label="Reason code">
            <select
              required
              className={inputClass}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              <option value="">Select a reason code</option>
              {settlementReasonOptions
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
              placeholder="Explain why this payout or settlement action is needed."
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
              disabled={
                mutation.isPending ||
                !reauthentication ||
                (secondApprovalEnabled && !secondApprovedBy.trim())
              }
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {mutation.isPending
                ? "Processing..."
                : !reauthentication
                  ? "Confirm reauthentication first"
                  : secondApprovalEnabled && !secondApprovedBy.trim()
                    ? "Select second approver first"
                    : actionButton(action)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SecondApprovalCapture({
  actor,
  actors,
  isLoadingPolicy,
  isLoadingActors,
  policyRequired,
  captureOptional,
  approvedBy,
  notes,
  onToggleOptional,
  onApprovedByChange,
  onNotesChange,
}: {
  actor: AuthzAdminRequestActor;
  actors: AuthzActor[];
  isLoadingPolicy: boolean;
  isLoadingActors: boolean;
  policyRequired: boolean;
  captureOptional: boolean;
  approvedBy: string;
  notes: string;
  onToggleOptional: (checked: boolean) => void;
  onApprovedByChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}) {
  const captureEnabled = policyRequired || captureOptional;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">
            {policyRequired
              ? "Second-person approval required"
              : "Second-person approval optional"}
          </p>
          <p className="mt-1">
            {policyRequired
              ? "This tenant requires a different approver before sensitive current-account operations can be submitted."
              : "Record a second approver when another authorized person reviewed this operation."}
          </p>
          <p className="mt-1 text-xs font-semibold">
            Primary actor: {actor.actorId || "—"}
          </p>
        </div>
        {!policyRequired ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
            <input
              type="checkbox"
              checked={captureOptional}
              onChange={(event) => onToggleOptional(event.target.checked)}
            />
            Record approval
          </label>
        ) : null}
      </div>

      {isLoadingPolicy ? (
        <p className="mt-3 text-xs font-semibold">Loading approval policy...</p>
      ) : null}

      {captureEnabled ? (
        <div className="mt-3 grid gap-3">
          <Field label="Second approver">
            <select
              required={policyRequired}
              className={inputClass}
              disabled={isLoadingActors || actors.length === 0}
              value={approvedBy}
              onChange={(event) => onApprovedByChange(event.target.value)}
            >
              <option value="">
                {isLoadingActors
                  ? "Loading approvers..."
                  : actors.length === 0
                    ? "No eligible second approver found"
                    : "Select a second approver"}
              </option>
              {actors.map((approver) => (
                <option key={approver.id} value={approver.actorKey}>
                  {approver.displayName
                    ? `${approver.displayName} (${approver.actorKey})`
                    : approver.actorKey}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Second approval notes">
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Optional review notes from the second approver."
            />
          </Field>
          {actors.length === 0 && !isLoadingActors ? (
            <p className="text-xs font-semibold text-amber-900">
              Add or activate another authorization actor in Authz Admin before
              posting this operation.
            </p>
          ) : null}
        </div>
      ) : null}
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
  return value.toFixed(2);
}
function formatGoldInputValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : value;
}
function parseGoldInputAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 100) / 100;
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function loadRequestActor(): AuthzAdminRequestActor {
  if (typeof window === "undefined") return defaultRequestActor;

  const storage = window.localStorage;
  if (typeof storage?.getItem !== "function") return defaultRequestActor;

  try {
    const stored = storage.getItem(AUTHZ_REQUEST_ACTOR_STORAGE_KEY);
    if (!stored) return defaultRequestActor;
    const parsed = JSON.parse(stored) as Partial<AuthzAdminRequestActor>;
    const actorId = typeof parsed.actorId === "string" ? parsed.actorId.trim() : "";
    const tenantId = typeof parsed.tenantId === "string" ? parsed.tenantId.trim() : "";
    return {
      actorId: actorId || defaultRequestActor.actorId,
      tenantId: tenantId || defaultRequestActor.tenantId,
    };
  } catch {
    return defaultRequestActor;
  }
}

function isEligibleSecondApprover(actor: AuthzActor, primaryActorId: string) {
  const actorKey = actor.actorKey.trim();
  if (!actor.active || !actorKey) return false;
  return actorKey.toLowerCase() !== primaryActorId.trim().toLowerCase();
}

function buildSecondApproval(
  enabled: boolean,
  approvedBy: string,
  notes: string,
): SecondApprovalInput | undefined {
  if (!enabled) return undefined;

  const normalizedApprovedBy = approvedBy.trim();
  if (!normalizedApprovedBy) return undefined;

  const normalizedNotes = notes.trim();
  return {
    approvedBy: normalizedApprovedBy,
    ...(normalizedNotes ? { notes: normalizedNotes } : {}),
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
