import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  confirmRecentReauthentication,
  loadRecentReauthentication,
  type RecentReauthentication,
} from "../../app/reauthStore";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import {
  authorizationRequestContext,
  readSelectedTenantId,
} from "../../api/tenantSelection";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { AuthzActor } from "../../types/authz";
import type { SettlementPreview, SecondApprovalInput } from "../../types/settlements";
import { useAuthzActors, useCurrentAuthzActor } from "../authz/useAuthzAdmin";
import { useSecondPersonApprovalPolicy } from "../current-accounts/useSecondPersonApprovalPolicy";
import {
  useCloseJourney,
  usePartialPayout,
  useSettlementPreview,
  useZeroGold,
} from "./useSettlements";

type Action = "ZERO_GOLD" | "PARTIAL_PAYOUT" | "CLOSE_JOURNEY";

function settlementReasonOptions(t: (key: string) => string) {
  return [
    {
      value: "GOLD_BALANCE_PAYOUT",
      label: t("settlementReasons.GOLD_BALANCE_PAYOUT"),
      actions: ["ZERO_GOLD"] satisfies Action[],
    },
    {
      value: "COLLABORATOR_REQUESTED_PAYOUT",
      label: t("settlementReasons.COLLABORATOR_REQUESTED_PAYOUT"),
      actions: ["PARTIAL_PAYOUT"] satisfies Action[],
    },
    {
      value: "SCHEDULED_PAYOUT",
      label: t("settlementReasons.SCHEDULED_PAYOUT"),
      actions: ["PARTIAL_PAYOUT"] satisfies Action[],
    },
    {
      value: "END_OF_JOURNEY_SETTLEMENT",
      label: t("settlementReasons.END_OF_JOURNEY_SETTLEMENT"),
      actions: ["CLOSE_JOURNEY"] satisfies Action[],
    },
    {
      value: "FINAL_BALANCE_PAYOUT",
      label: t("settlementReasons.FINAL_BALANCE_PAYOUT"),
      actions: ["CLOSE_JOURNEY"] satisfies Action[],
    },
  ];
}

export function JourneySettlementPanel({
  collaboratorId,
  projectedEndDate,
  closedAt = "",
}: {
  collaboratorId: string;
  projectedEndDate: string;
  closedAt?: string;
}) {
  const { t } = useTranslation("collaborators");
  const preview = useSettlementPreview(collaboratorId);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [receiptEntryIds, setReceiptEntryIds] = useState<string[]>([]);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {t("journeySettlement.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("journeySettlement.description")}
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
          {t("journeySettlement.refresh")}
        </button>
      </div>

      {preview.isLoading ? (
        <p className="mt-4 text-sm text-gray-600">
          {t("journeySettlement.loading")}
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
              {t("journeySettlement.printReceipt")}
              {receiptEntryIds.length > 1 ? ` ${index + 1}` : ""}
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
              {t("journeySettlement.zeroGold")}
            </button>
            <button
              type="button"
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => setAction("PARTIAL_PAYOUT")}
            >
              {t("journeySettlement.partialPayout")}
            </button>
            <button
              type="button"
              className="rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!preview.data.canClose}
              onClick={() => setAction("CLOSE_JOURNEY")}
            >
              {t("journeySettlement.closeJourney")}
            </button>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            {t("journeySettlement.authzHint")}
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
  const { t } = useTranslation("collaborators");
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Summary label={t("journeySettlement.brlBalance")} value={formatBRL(preview.brlBalance)} />
      <Summary
        label={t("journeySettlement.goldBalance")}
        value={`${formatGold(preview.goldGramBalance)} g`}
      />
      <Summary
        label={t("journeySettlement.pendingAccruals")}
        value={String(preview.pendingAccrualItems)}
      />
      <Summary label={t("journeySettlement.canClose")} value={preview.canClose ? t("journeySettlement.yes") : t("journeySettlement.no")} />
      {preview.blockingReasons.length > 0 ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2 lg:col-span-4">
          <span className="font-semibold">{t("journeySettlement.blockingReasons")}:</span>{" "}
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
  const { t } = useTranslation("collaborators");
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
  const [tenantId] = useState(() =>
    typeof window === "undefined" ? "default" : readSelectedTenantId(window.localStorage),
  );
  const requestActor = useMemo(() => authorizationRequestContext(tenantId), [tenantId]);
  const currentActorQuery = useCurrentAuthzActor(requestActor);
  const secondApprovalPolicy = useSecondPersonApprovalPolicy(requestActor);
  const actorsQuery = useAuthzActors(requestActor);
  const [captureOptionalSecondApproval, setCaptureOptionalSecondApproval] =
    useState(false);
  const [secondApprovedBy, setSecondApprovedBy] = useState("");
  const [secondApprovalNotes, setSecondApprovalNotes] = useState("");
  const secondApprovalRequired = Boolean(secondApprovalPolicy.data?.required);
  const secondApprovalEnabled =
    secondApprovalRequired || captureOptionalSecondApproval;
  const primaryActorId = currentActorQuery.data?.actorKey ?? "";
  const eligibleSecondApprovers = (actorsQuery.data ?? []).filter((actor) =>
    isEligibleSecondApprover(actor, primaryActorId),
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
      onSuccess(t("journeySettlement.action.successZeroGold"), [result.ledgerEntry.id]);
      return;
    }
    if (action === "PARTIAL_PAYOUT") {
      const result = await payout.mutateAsync({
        ...base,
        brlAmount: Number(brlAmount || 0),
        goldGramAmount: parseGoldInputAmount(goldAmount),
      });
      onSuccess(
        t("journeySettlement.action.successPartialPayout"),
        result.ledgerEntries.map((entry) => entry.id),
      );
      return;
    }
    const result = await closeJourney.mutateAsync({ ...base, confirm: true });
    onSuccess(
      t("journeySettlement.action.successCloseJourney"),
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
              {actionTitle(action, t)}
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {actionDescription(action, preview, t)}
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
              <Field label={t("journeySettlement.fields.brlAmount")}>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={brlAmount}
                  onChange={(event) => setBrlAmount(event.target.value)}
                />
              </Field>
              <Field label={t("journeySettlement.fields.goldGrams")}>
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
          <Field label={t("journeySettlement.fields.effectiveDate")}>
            <input
              required
              className={inputClass}
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </Field>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">{t("journeySettlement.authorizationActor.title")}</p>
            <p className="mt-1">
              {t("journeySettlement.authorizationActor.description")}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{t("journeySettlement.reasonRequired.title")}</p>
            <p className="mt-1">
              {t("journeySettlement.reasonRequired.description")}
            </p>
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{t("journeySettlement.reauth.title")}</p>
                <p className="mt-1">
                  {t("journeySettlement.reauth.description")}
                </p>
                {reauthentication ? (
                  <p className="mt-2 text-xs font-semibold">
                    {t("journeySettlement.reauth.confirmedAt", {
                      dateTime: formatDateTime(reauthentication.reauthenticatedAt),
                    })}
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold">
                    {t("journeySettlement.reauth.notConfirmed")}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="rounded-xl bg-purple-900 px-3 py-2 text-sm font-semibold text-white"
                onClick={() => setReauthentication(confirmRecentReauthentication())}
              >
                {t("journeySettlement.reauth.confirmButton")}
              </button>
            </div>
          </div>
          <SecondApprovalCapture
            primaryActorId={primaryActorId}
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

          <Field label={t("journeySettlement.fields.reasonCode")}>
            <select
              required
              className={inputClass}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              <option value="">{t("journeySettlement.reasonSelectPlaceholder")}</option>
              {settlementReasonOptions(t)
                .filter((option) => option.actions.includes(action))
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t("journeySettlement.fields.reasonText")}>
            <textarea
              required
              className={inputClass}
              rows={3}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              placeholder={t("journeySettlement.reasonTextPlaceholder")}
            />
          </Field>
          <Field label={t("journeySettlement.fields.notes")}>
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
              {t("cancel")}
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
                ? t("journeySettlement.processing")
                : !reauthentication
                  ? t("journeySettlement.reauth.confirmFirst")
                  : secondApprovalEnabled && !secondApprovedBy.trim()
                    ? t("journeySettlement.secondApproval.selectSecondApproverFirst")
                    : actionButton(action, t)}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SecondApprovalCapture({
  primaryActorId,
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
  primaryActorId: string;
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
  const { t } = useTranslation("collaborators");
  const captureEnabled = policyRequired || captureOptional;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">
            {policyRequired
              ? t("journeySettlement.secondApproval.required")
              : t("journeySettlement.secondApproval.optional")}
          </p>
          <p className="mt-1">
            {policyRequired
              ? t("journeySettlement.secondApproval.requiredDescription")
              : t("journeySettlement.secondApproval.optionalDescription")}
          </p>
          <p className="mt-1 text-xs font-semibold">
            {t("journeySettlement.secondApproval.primaryActor")}: {primaryActorId || t("journeySettlement.secondApproval.loadingPrimaryActor")}
          </p>
        </div>
        {!policyRequired ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
            <input
              type="checkbox"
              checked={captureOptional}
              onChange={(event) => onToggleOptional(event.target.checked)}
            />
            {t("journeySettlement.secondApproval.recordApproval")}
          </label>
        ) : null}
      </div>

      {isLoadingPolicy ? (
        <p className="mt-3 text-xs font-semibold">{t("journeySettlement.secondApproval.loadingPolicy")}</p>
      ) : null}

      {captureEnabled ? (
        <div className="mt-3 grid gap-3">
          <Field label={t("journeySettlement.secondApproval.secondApprover")}>
            <select
              required={policyRequired}
              className={inputClass}
              disabled={isLoadingActors || actors.length === 0}
              value={approvedBy}
              onChange={(event) => onApprovedByChange(event.target.value)}
            >
              <option value="">
                {isLoadingActors
                  ? t("journeySettlement.secondApproval.loadingApprovers")
                  : actors.length === 0
                    ? t("journeySettlement.secondApproval.noApproverFound")
                    : t("journeySettlement.secondApproval.selectSecondApprover")}
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
          <Field label={t("journeySettlement.secondApproval.notes")}>
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder={t("journeySettlement.secondApproval.notesPlaceholder")}
            />
          </Field>
          {actors.length === 0 && !isLoadingActors ? (
            <p className="text-xs font-semibold text-amber-900">
              {t("journeySettlement.secondApproval.activateActorHint")}
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
function actionTitle(action: Action, t: (key: string, options?: Record<string, unknown>) => string) {
  return action === "ZERO_GOLD"
    ? t("journeySettlement.action.zeroGoldTitle")
    : action === "PARTIAL_PAYOUT"
      ? t("journeySettlement.action.partialPayoutTitle")
      : t("journeySettlement.action.closeJourneyTitle");
}
function actionButton(action: Action, t: (key: string, options?: Record<string, unknown>) => string) {
  return action === "ZERO_GOLD"
    ? t("journeySettlement.action.zeroGoldButton")
    : action === "PARTIAL_PAYOUT"
      ? t("journeySettlement.action.partialPayoutButton")
      : t("journeySettlement.action.closeJourneyButton");
}
function actionDescription(action: Action, preview: SettlementPreview, t: (key: string, options?: Record<string, unknown>) => string) {
  if (action === "ZERO_GOLD")
    return t("journeySettlement.action.zeroGoldDescription", {
      amount: formatGold(preview.goldGramBalance),
    });
  if (action === "PARTIAL_PAYOUT")
    return t("journeySettlement.action.partialPayoutDescription");
  return t("journeySettlement.action.closeJourneyDescription");
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
