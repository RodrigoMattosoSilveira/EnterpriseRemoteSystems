import { useEffect, useMemo, useState } from "react";
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
import { useI18n, translateEnglish, type Translate, type TranslationKey } from "../../i18n";
import type { AuthzActor } from "../../types/authz";
import type { SettlementPreview, SecondApprovalInput } from "../../types/settlements";
import { useCurrentAuthzActor, useTenantAuthzActors } from "../authz/useAuthzAdmin";
import { useSecondPersonApprovalPolicy } from "../current-accounts/useSecondPersonApprovalPolicy";
import { useExtendCollaboratorJourney } from "./useCollaborators";
import {
  useCloseJourney,
  useFinalCollaboratorPayment,
  useFinalTenantPayment,
  usePartialPayout,
  useSettlementPreview,
  useZeroGold,
} from "./useSettlements";

type SensitiveAction = "ZERO_GOLD" | "PARTIAL_PAYOUT" | "FINAL_TENANT_PAYMENT" | "FINAL_COLLABORATOR_PAYMENT" | "CLOSE_JOURNEY";
type Action = SensitiveAction | "EXTEND_JOURNEY";

const settlementReasonOptions: Array<{
  value: string;
  labelKey: TranslationKey;
  actions: SensitiveAction[];
}> = [
  {
    value: "GOLD_BALANCE_PAYOUT",
    labelKey: "settlement.reasonGold",
    actions: ["ZERO_GOLD"] satisfies SensitiveAction[],
  },
  {
    value: "COLLABORATOR_REQUESTED_PAYOUT",
    labelKey: "settlement.reasonRequested",
    actions: ["PARTIAL_PAYOUT"] satisfies SensitiveAction[],
  },
  {
    value: "SCHEDULED_PAYOUT",
    labelKey: "settlement.reasonScheduled",
    actions: ["PARTIAL_PAYOUT"] satisfies SensitiveAction[],
  },
  {
    value: "FINAL_TENANT_PAYMENT",
    labelKey: "settlement.reasonTenantFinal",
    actions: ["FINAL_TENANT_PAYMENT"] satisfies SensitiveAction[],
  },
  {
    value: "FINAL_COLLABORATOR_PAYMENT",
    labelKey: "settlement.reasonCollaboratorFinal",
    actions: ["FINAL_COLLABORATOR_PAYMENT"] satisfies SensitiveAction[],
  },
  {
    value: "END_OF_JOURNEY_SETTLEMENT",
    labelKey: "settlement.reasonJourneyEnd",
    actions: ["CLOSE_JOURNEY"] satisfies SensitiveAction[],
  },
];

export function JourneySettlementPanel({
  collaboratorId,
  projectedEndDate,
  closedAt = "",
  onJourneyClosed,
}: {
  collaboratorId: string;
  projectedEndDate: string;
  closedAt?: string;
  onJourneyClosed?: (message: string) => void;
}) {
  const { t } = useI18n();

  const preview = useSettlementPreview(collaboratorId);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState("");
  const [receiptEntryIds, setReceiptEntryIds] = useState<string[]>([]);

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            {t("settlement.title")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {t("settlement.subtitle")}
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
          {t("settlement.refresh")}
        </button>
      </div>

      {preview.isLoading ? (
        <p className="mt-4 text-sm text-gray-600">
          {t("settlement.loading")}
        </p>
      ) : null}
      {preview.error ? (
        <div className="mt-4">
          <ApiErrorPanel error={preview.error} translate={t} />
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
              {t("settlement.openReceipt")}{receiptEntryIds.length > 1 ? ` ${index + 1}` : ""}
            </Link>
          ))}
        </div>
      ) : null}

      {preview.data ? (
        <>
          <PreviewSummary preview={preview.data} />
          <SettlementWorkflow preview={preview.data} onAction={setAction} />
          <details className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700">
              {t("settlement.otherActions")}
            </summary>
            <p className="mt-2 text-xs text-gray-500">
              {t("settlement.otherActionsHelp")}
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={preview.data.goldGramBalance <= 0}
                onClick={() => setAction("ZERO_GOLD")}
              >
                {t("settlement.zeroGoldShort")}
              </button>
              <button
                type="button"
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setAction("PARTIAL_PAYOUT")}
              >
                {t("settlement.partialPayoutShort")}
              </button>
            </div>
          </details>
          <p className="mt-4 text-xs text-gray-500">
            {t("settlement.actorHelp")}
          </p>
        </>
      ) : null}

      {action === "EXTEND_JOURNEY" ? (
        <JourneyExtensionPanel
          collaboratorId={collaboratorId}
          projectedEndDate={projectedEndDate}
          onClose={() => setAction(null)}
          onSuccess={(text) => {
            setMessage(text);
            setReceiptEntryIds([]);
            setAction(null);
          }}
        />
      ) : action && preview.data ? (
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
          onJourneyClosed={onJourneyClosed}
        />
      ) : null}
    </section>
  );
}

function SettlementWorkflow({
  preview,
  onAction,
}: {
  preview: SettlementPreview;
  onAction: (action: Action) => void;
}) {
  const { t, formatCurrency, formatNumber } = useI18n();

  const tenantOwesCollaborator =
    preview.brlBalance > 0 || preview.goldGramBalance > 0;
  const collaboratorOwesTenant =
    preview.brlBalance < 0 || preview.goldGramBalance < 0;
  const balancesZero = !tenantOwesCollaborator && !collaboratorOwesTenant;

  return (
    <div className="mt-5 grid gap-4">
      {tenantOwesCollaborator ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <h3 className="font-bold text-green-950">{t("settlement.tenantOwes")}</h3>
          <p className="mt-1 text-sm text-green-900">
            {t("settlement.tenantOwesHelp")}
          </p>
          <p className="mt-2 text-sm font-semibold text-green-950">
            {positiveBalanceSummary(preview, t, formatCurrency, formatNumber)}
          </p>
          <button
            type="button"
            className="mt-3 rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => onAction("FINAL_TENANT_PAYMENT")}
          >
            {t("settlement.settleTenant")}
          </button>
        </section>
      ) : null}

      {collaboratorOwesTenant ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-bold text-blue-950">{t("settlement.collaboratorOwes")}</h3>
          <p className="mt-1 text-sm text-blue-900">
            {t("settlement.collaboratorOwesHelp")}
          </p>
          <p className="mt-2 text-sm font-semibold text-blue-950">
            {negativeBalanceSummary(preview, t, formatCurrency, formatNumber)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800"
              onClick={() => onAction("EXTEND_JOURNEY")}
            >
              {t("settlement.extendJourney")}
            </button>
            <button
              type="button"
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => onAction("FINAL_COLLABORATOR_PAYMENT")}
            >
              {t("settlement.recordCollaborator")}
            </button>
          </div>
        </section>
      ) : null}

      {balancesZero && preview.outstandingReceipts > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-950">
            {t("settlement.receiptPendingTitle")}
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            {t(preview.outstandingReceipts === 1 ? "settlement.receiptPendingOne" : "settlement.receiptPendingMany", { count: preview.outstandingReceipts })}
          </p>
          <Link
            className="mt-3 inline-flex text-sm font-semibold text-amber-950 underline"
            to="/receipts/outstanding"
          >
            {t("settlement.reviewOutstanding")}
          </Link>
        </section>
      ) : null}

      {preview.pendingAccrualItems > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-950">{t("settlement.pendingEarnings")}</h3>
          <p className="mt-1 text-sm text-amber-900">
            {t(preview.pendingAccrualItems === 1 ? "settlement.pendingAccrualOne" : "settlement.pendingAccrualMany", { count: preview.pendingAccrualItems })}
          </p>
        </section>
      ) : null}

      <section className={`rounded-2xl border p-4 ${preview.canClose ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
        <h3 className={`font-bold ${preview.canClose ? "text-emerald-950" : "text-gray-900"}`}>
          {preview.canClose ? t("settlement.readyClose") : t("settlement.blocked")}
        </h3>
        <p className={`mt-1 text-sm ${preview.canClose ? "text-emerald-900" : "text-gray-600"}`}>
          {preview.canClose ? t("settlement.closeReadyHelp") : t("settlement.closeBlockedHelp")}
        </p>
        <button
          type="button"
          className="mt-3 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!preview.canClose}
          onClick={() => onAction("CLOSE_JOURNEY")}
        >
          {t("settlement.closeJourney")}
        </button>
      </section>
    </div>
  );
}

function JourneyExtensionPanel({
  collaboratorId,
  projectedEndDate,
  onClose,
  onSuccess,
}: {
  collaboratorId: string;
  projectedEndDate: string;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {  const { t, formatDate } = useI18n();

  const extendJourney = useExtendCollaboratorJourney(collaboratorId);
  const [additionalDays, setAdditionalDays] = useState("7");
  const parsedDays = Number(additionalDays);
  const validDays = Number.isInteger(parsedDays) && parsedDays > 0;
  const nextProjectedEndDate = validDays
    ? addDaysToISODate(projectedEndDate, parsedDays)
    : "";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) =>
      event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validDays) return;
    const updated = await extendJourney.mutateAsync({ additionalDays: parsedDays });
    onSuccess(
      t(parsedDays === 1 ? "settlement.extendedOne" : "settlement.extendedMany", {
        count: parsedDays,
        date: formatDate(updated.projectedEndDate),
      }),
    );
  }

  return (
    <div
      role="region"
      aria-labelledby="journey-extension-panel-title"
      className="mt-5 rounded-2xl border border-blue-200 bg-blue-50 p-4 shadow-inner"
    >
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="journey-extension-panel-title" className="text-lg font-bold text-gray-950">
              {t("settlement.extendJourney")}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {t("settlement.extensionHelp")}
            </p>
          </div>
          <button type="button" aria-label={t("settlement.closeAria")} className="text-2xl text-gray-500" onClick={onClose}>×</button>
        </div>

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Summary label={t("settlement.currentProjectedEnd")} value={formatDate(projectedEndDate)} />
            <Summary label={t("settlement.newProjectedEnd")} value={nextProjectedEndDate ? formatDate(nextProjectedEndDate) : "—"} />
          </div>
          <Field label={t("settlement.additionalDays")}>
            <input
              required
              className={inputClass}
              type="number"
              min="1"
              step="1"
              value={additionalDays}
              onChange={(event) => setAdditionalDays(event.target.value)}
            />
          </Field>
          <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">
            {t("settlement.extensionCumulativeHelp")}
          </p>
          {extendJourney.error ? <ApiErrorPanel error={extendJourney.error} translate={t} /> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={!validDays || extendJourney.isPending}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {extendJourney.isPending ? t("settlement.extending") : t("settlement.confirmExtension")}
            </button>
            <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={onClose}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function positiveBalanceSummary(
  preview: SettlementPreview,
  t: Translate,
  formatCurrency: ReturnType<typeof useI18n>["formatCurrency"],
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  const parts: string[] = [];
  if (preview.brlBalance > 0) parts.push(formatCurrency(preview.brlBalance, "BRL"));
  if (preview.goldGramBalance > 0) {
    parts.push(t("settlement.goldAmount", { value: formatNumber(preview.goldGramBalance, { maximumFractionDigits: 2 }) }));
  }
  return t("settlement.tenantPaymentRequired", { amounts: parts.join(` ${t("common.and")} `) });
}

function negativeBalanceSummary(
  preview: SettlementPreview,
  t: Translate,
  formatCurrency: ReturnType<typeof useI18n>["formatCurrency"],
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
) {
  const parts: string[] = [];
  if (preview.brlBalance < 0) parts.push(formatCurrency(Math.abs(preview.brlBalance), "BRL"));
  if (preview.goldGramBalance < 0) {
    parts.push(t("settlement.goldAmount", { value: formatNumber(Math.abs(preview.goldGramBalance), { maximumFractionDigits: 2 }) }));
  }
  return t("settlement.collaboratorRepaymentRequired", { amounts: parts.join(` ${t("common.and")} `) });
}

function PreviewSummary({ preview }: { preview: SettlementPreview }) {
  const { t, formatCurrency } = useI18n();
  const receiptAcceptancePending =
    preview.brlBalance === 0 &&
    preview.goldGramBalance === 0 &&
    preview.outstandingReceipts > 0;
  const visibleBlockingReasons = preview.blockingReasons.filter((reason) => {
    if (reason !== "OUTSTANDING_RECEIPTS") return true;
    // Receipt-only closure blocking already has a dedicated, actionable panel.
    // Also suppress a stale/inconsistent receipt reason when the count is zero.
    return preview.outstandingReceipts > 0 && !receiptAcceptancePending;
  });

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Summary label={t("settlement.brlBalance")} value={formatCurrency(preview.brlBalance, "BRL")} />
      <Summary
        label={t("settlement.goldBalance")}
        value={`${formatGold(preview.goldGramBalance)} g`}
      />
      <Summary
        label={t("settlement.pendingAccruals")}
        value={String(preview.pendingAccrualItems)}
      />
      <Summary
        label={t("settlement.outstandingReceipts")}
        value={String(preview.outstandingReceipts)}
      />
      <Summary label={t("settlement.canClose")} value={preview.canClose ? t("settlement.yes") : t("settlement.no")} />
      {visibleBlockingReasons.length > 0 ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2 lg:col-span-4">
          <span className="font-semibold">{t("settlement.blockingReasons")}</span>{" "}
          {visibleBlockingReasons.map((reason) => formatReason(reason, t)).join(", ")}
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
  onJourneyClosed,
}: {
  action: SensitiveAction;
  collaboratorId: string;
  preview: SettlementPreview;
  onClose: () => void;
  onSuccess: (message: string, ledgerEntryIds: string[]) => void;
  onJourneyClosed?: (message: string) => void;
}) {  const { t, formatDateTime } = useI18n();

  const zeroGold = useZeroGold(collaboratorId);
  const payout = usePartialPayout(collaboratorId);
  const finalTenantPayment = useFinalTenantPayment(collaboratorId);
  const finalCollaboratorPayment = useFinalCollaboratorPayment(collaboratorId);
  const closeJourney = useCloseJourney(collaboratorId, () =>
    onJourneyClosed?.(t("settlement.success.closed")),
  );
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
  const actorsQuery = useTenantAuthzActors(requestActor);
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
        : action === "FINAL_TENANT_PAYMENT"
          ? finalTenantPayment
          : action === "FINAL_COLLABORATOR_PAYMENT"
            ? finalCollaboratorPayment
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
      onSuccess(t("settlement.success.gold"), [result.ledgerEntry.id]);
      return;
    }
    if (action === "PARTIAL_PAYOUT") {
      const result = await payout.mutateAsync({
        ...base,
        brlAmount: Number(brlAmount || 0),
        goldGramAmount: parseGoldInputAmount(goldAmount),
      });
      onSuccess(
        t("settlement.success.partial"),
        result.ledgerEntries.map((entry) => entry.id),
      );
      return;
    }
    if (action === "FINAL_TENANT_PAYMENT") {
      const result = await finalTenantPayment.mutateAsync(base);
      onSuccess(
        t("settlement.success.finalTenant"),
        result.ledgerEntries.map((entry) => entry.id),
      );
      return;
    }
    if (action === "FINAL_COLLABORATOR_PAYMENT") {
      const result = await finalCollaboratorPayment.mutateAsync(base);
      onSuccess(
        t("settlement.success.finalCollaborator"),
        result.ledgerEntries.map((entry) => entry.id),
      );
      return;
    }
    const result = await closeJourney.mutateAsync({ ...base, confirm: true });
    onSuccess(
      t("settlement.success.closed"),
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
            aria-label={t("settlement.closeAria")}
            className="text-2xl text-gray-500"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <form className="mt-5 grid gap-4" onSubmit={submit}>
          {action === "PARTIAL_PAYOUT" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("settlement.brlAmount")}>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="0.01"
                  value={brlAmount}
                  onChange={(event) => setBrlAmount(event.target.value)}
                />
              </Field>
              <Field label={t("settlement.goldGrams")}>
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
          <Field label={t("settlement.effectiveDate")}>
            <input
              required
              className={inputClass}
              type="date"
              value={effectiveDate}
              onChange={(event) => setEffectiveDate(event.target.value)}
            />
          </Field>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <p className="font-semibold">{t("settlement.authorizationActor")}</p>
            <p className="mt-1">
              {t("settlement.authActorHelp")}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{t("settlement.reasonRequired")}</p>
            <p className="mt-1">
              {t("settlement.reasonHelp")}
            </p>
          </div>

          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">{t("settlement.reauthRequired")}</p>
                <p className="mt-1">
                  {t("settlement.reauthHelp")}
                </p>
                {reauthentication ? (
                  <p className="mt-2 text-xs font-semibold">
                    {t("settlement.confirmedAt", { date: formatDateTime(reauthentication.reauthenticatedAt) })}
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold">
                    {t("settlement.notConfirmed")}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="rounded-xl bg-purple-900 px-3 py-2 text-sm font-semibold text-white"
                onClick={() => setReauthentication(confirmRecentReauthentication())}
              >
                {t("settlement.confirmReauthAction")}
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

          <Field label={t("settlement.reasonCode")}>
            <select
              required
              className={inputClass}
              value={reasonCode}
              onChange={(event) => setReasonCode(event.target.value)}
            >
              <option value="">{t("settlement.selectReason")}</option>
              {settlementReasonOptions
                .filter((option) => option.actions.includes(action))
                .map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.labelKey)}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={t("settlement.reasonText")}>
            <textarea
              required
              className={inputClass}
              rows={3}
              value={reasonText}
              onChange={(event) => setReasonText(event.target.value)}
              placeholder={t("settlement.reasonPlaceholder")}
            />
          </Field>
          <Field label={t("settlement.notes")}>
            <textarea
              className={inputClass}
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
          {mutation.error ? <ApiErrorPanel error={mutation.error} translate={t} /> : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold"
              onClick={onClose}
            >
              {t("common.cancel")}
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
                ? t("settlement.process")
                : !reauthentication
                  ? t("settlement.confirmReauth")
                  : secondApprovalEnabled && !secondApprovedBy.trim()
                    ? t("settlement.selectApprover")
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
}) {  const { t } = useI18n();

  const captureEnabled = policyRequired || captureOptional;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold">
            {policyRequired
              ? t("settlement.secondRequired")
              : t("settlement.secondOptional")}
          </p>
          <p className="mt-1">
            {policyRequired
              ? t("settlement.secondRequiredHelp")
              : t("settlement.secondOptionalHelp")}
          </p>
          <p className="mt-1 text-xs font-semibold">
            {t("settlement.primaryActor", { actor: primaryActorId || t("settlement.loadingActor") })}
          </p>
        </div>
        {!policyRequired ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-emerald-950">
            <input
              type="checkbox"
              checked={captureOptional}
              onChange={(event) => onToggleOptional(event.target.checked)}
            />
            {t("settlement.recordApproval")}
          </label>
        ) : null}
      </div>

      {isLoadingPolicy ? (
        <p className="mt-3 text-xs font-semibold">{t("settlement.loadingPolicy")}</p>
      ) : null}

      {captureEnabled ? (
        <div className="mt-3 grid gap-3">
          <Field label={t("settlement.secondApprover")}>
            <select
              required={policyRequired}
              className={inputClass}
              disabled={isLoadingActors || actors.length === 0}
              value={approvedBy}
              onChange={(event) => onApprovedByChange(event.target.value)}
            >
              <option value="">
                {isLoadingActors
                  ? t("settlement.loadingApprovers")
                  : actors.length === 0
                    ? t("settlement.noApprover")
                    : t("settlement.selectSecondApprover")}
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
          <Field label={t("settlement.secondNotes")}>
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder={t("settlement.secondNotesPlaceholder")}
            />
          </Field>
          {actors.length === 0 && !isLoadingActors ? (
            <p className="text-xs font-semibold text-amber-900">
              {t("settlement.addActorHelp")}
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
function actionTitle(action: SensitiveAction, t: Translate = translateEnglish) {
  if (action === "ZERO_GOLD") return t("settlement.zeroGold");
  if (action === "PARTIAL_PAYOUT") return t("settlement.partialPayout");
  if (action === "FINAL_TENANT_PAYMENT") return t("settlement.finalTenant");
  if (action === "FINAL_COLLABORATOR_PAYMENT") return t("settlement.finalCollaborator");
  return t("settlement.closeJourney");
}
function actionButton(action: SensitiveAction, t: Translate = translateEnglish) {
  if (action === "ZERO_GOLD") return t("settlement.postGold");
  if (action === "PARTIAL_PAYOUT") return t("settlement.postPayout");
  if (action === "FINAL_TENANT_PAYMENT") return t("settlement.postFinalTenant");
  if (action === "FINAL_COLLABORATOR_PAYMENT") return t("settlement.postFinalCollaborator");
  return t("settlement.closeJourney");
}
function actionDescription(
  action: SensitiveAction,
  preview: SettlementPreview,
  t: Translate = translateEnglish,
) {
  if (action === "ZERO_GOLD") {
    return t("settlement.action.zeroGoldHelp", {
      amount: t("settlement.goldAmount", { value: formatGold(preview.goldGramBalance) }),
    });
  }
  if (action === "PARTIAL_PAYOUT") return t("settlement.action.partialHelp");
  if (action === "FINAL_TENANT_PAYMENT") return t("settlement.action.finalTenantHelp");
  if (action === "FINAL_COLLABORATOR_PAYMENT") return t("settlement.action.finalCollaboratorHelp");
  return t("settlement.action.closeHelp");
}
function formatReason(value: string, t: Translate = translateEnglish) {
  if (value === "NON_ZERO_BALANCE") return t("settlement.blocker.nonZeroBalance");
  return value.toLowerCase().replaceAll("_", " ");
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
function addDaysToISODate(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
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
