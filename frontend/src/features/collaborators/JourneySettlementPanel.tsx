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
  label: string;
  actions: SensitiveAction[];
}> = [
  {
    value: "GOLD_BALANCE_PAYOUT",
    label: "Gold balance payout",
    actions: ["ZERO_GOLD"] satisfies SensitiveAction[],
  },
  {
    value: "COLLABORATOR_REQUESTED_PAYOUT",
    label: "Collaborator requested payout",
    actions: ["PARTIAL_PAYOUT"] satisfies SensitiveAction[],
  },
  {
    value: "SCHEDULED_PAYOUT",
    label: "Scheduled payout",
    actions: ["PARTIAL_PAYOUT"] satisfies SensitiveAction[],
  },
  {
    value: "FINAL_TENANT_PAYMENT",
    label: "Final Tenant payment",
    actions: ["FINAL_TENANT_PAYMENT"] satisfies SensitiveAction[],
  },
  {
    value: "FINAL_COLLABORATOR_PAYMENT",
    label: "Final Collaborator repayment",
    actions: ["FINAL_COLLABORATOR_PAYMENT"] satisfies SensitiveAction[],
  },
  {
    value: "END_OF_JOURNEY_SETTLEMENT",
    label: "End-of-journey closure",
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
            Preview Journey balances, settle them separately, and close only after every value-unit balance is zero.
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
              Open receipt{receiptEntryIds.length > 1 ? ` ${index + 1}` : ""}
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
              Other payout actions
            </summary>
            <p className="mt-2 text-xs text-gray-500">
              These operational payouts remain available during an open Journey, but they are not substitutes for the direction-aware final settlement required at Journey end.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
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
            </div>
          </details>
          <p className="mt-4 text-xs text-gray-500">
            Settlement actions use the current authorization actor selected in
            Authz Admin. Operators should not handle backend settlement secrets.
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
  const tenantOwesCollaborator =
    preview.brlBalance > 0 || preview.goldGramBalance > 0;
  const collaboratorOwesTenant =
    preview.brlBalance < 0 || preview.goldGramBalance < 0;
  const balancesZero = !tenantOwesCollaborator && !collaboratorOwesTenant;

  return (
    <div className="mt-5 grid gap-4">
      {tenantOwesCollaborator ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <h3 className="font-bold text-green-950">Tenant owes Collaborator</h3>
          <p className="mt-1 text-sm text-green-900">
            Post the exact positive Journey balance as the final Tenant payment. The generated receipt must then be accepted in-app by the Collaborator.
          </p>
          <p className="mt-2 text-sm font-semibold text-green-950">
            {positiveBalanceSummary(preview)}
          </p>
          <button
            type="button"
            className="mt-3 rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => onAction("FINAL_TENANT_PAYMENT")}
          >
            Settle Tenant Owed Balance
          </button>
        </section>
      ) : null}

      {collaboratorOwesTenant ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
          <h3 className="font-bold text-blue-950">Collaborator owes Tenant</h3>
          <p className="mt-1 text-sm text-blue-900">
            Either extend the open Journey to give the Collaborator more time to earn the amount owed, or record the full repayment already received by the Tenant.
          </p>
          <p className="mt-2 text-sm font-semibold text-blue-950">
            {negativeBalanceSummary(preview)}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-800"
              onClick={() => onAction("EXTEND_JOURNEY")}
            >
              Extend Journey
            </button>
            <button
              type="button"
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => onAction("FINAL_COLLABORATOR_PAYMENT")}
            >
              Record Collaborator Payment
            </button>
          </div>
        </section>
      ) : null}

      {balancesZero && preview.outstandingReceipts > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-950">
            Balances settled — receipt acceptance pending
          </h3>
          <p className="mt-1 text-sm text-amber-900">
            The Journey balances are zero, but {preview.outstandingReceipts} final-settlement receipt{preview.outstandingReceipts === 1 ? " remains" : "s remain"} outstanding. The designated accepting party must complete in-app acceptance before closure.
          </p>
          <Link
            className="mt-3 inline-flex text-sm font-semibold text-amber-950 underline"
            to="/receipts/outstanding"
          >
            Review outstanding receipts
          </Link>
        </section>
      ) : null}

      {preview.pendingAccrualItems > 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-bold text-amber-950">Pending earnings remain</h3>
          <p className="mt-1 text-sm text-amber-900">
            Post or resolve {preview.pendingAccrualItems} pending accrual item{preview.pendingAccrualItems === 1 ? "" : "s"} before final closure.
          </p>
        </section>
      ) : null}

      <section className={`rounded-2xl border p-4 ${preview.canClose ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-gray-50"}`}>
        <h3 className={`font-bold ${preview.canClose ? "text-emerald-950" : "text-gray-900"}`}>
          {preview.canClose ? "Ready to close Journey" : "Journey closure is blocked"}
        </h3>
        <p className={`mt-1 text-sm ${preview.canClose ? "text-emerald-900" : "text-gray-600"}`}>
          {preview.canClose
            ? "Every Journey balance is zero, required receipts are complete, and no pending accrual blockers remain."
            : "Resolve every blocking condition above before closing. Close Journey never posts or converts a settlement payment."}
        </p>
        <button
          type="button"
          className="mt-3 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!preview.canClose}
          onClick={() => onAction("CLOSE_JOURNEY")}
        >
          Close Journey
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
}) {
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
      `Journey extended by ${parsedDays} day${parsedDays === 1 ? "" : "s"}. New projected end date: ${formatDateOnly(updated.projectedEndDate)}.`,
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
              Extend Journey
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              Give the Collaborator more time to earn against the amount owed to the Tenant. Extending the Journey does not post a Ledger Entry and does not settle the current debt.
            </p>
          </div>
          <button type="button" aria-label="Close" className="text-2xl text-gray-500" onClick={onClose}>×</button>
        </div>

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Summary label="Current projected end" value={formatDateOnly(projectedEndDate)} />
            <Summary label="New projected end" value={nextProjectedEndDate ? formatDateOnly(nextProjectedEndDate) : "—"} />
          </div>
          <Field label="Additional days">
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
            The extension is added to the Journey's existing cumulative extension. The Journey remains open and the amount owed remains unchanged until later earnings or a recorded Collaborator payment brings the balance to zero.
          </p>
          {extendJourney.error ? <ApiErrorPanel error={extendJourney.error} /> : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={!validDays || extendJourney.isPending}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {extendJourney.isPending ? "Extending..." : "Confirm Extension"}
            </button>
            <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function positiveBalanceSummary(preview: SettlementPreview) {
  const parts: string[] = [];
  if (preview.brlBalance > 0) parts.push(formatBRL(preview.brlBalance));
  if (preview.goldGramBalance > 0) parts.push(`${formatGold(preview.goldGramBalance)} g gold`);
  return `Tenant payment required: ${parts.join(" and ")}.`;
}

function negativeBalanceSummary(preview: SettlementPreview) {
  const parts: string[] = [];
  if (preview.brlBalance < 0) parts.push(formatBRL(Math.abs(preview.brlBalance)));
  if (preview.goldGramBalance < 0) parts.push(`${formatGold(Math.abs(preview.goldGramBalance))} g gold`);
  return `Collaborator repayment required: ${parts.join(" and ")}.`;
}

function PreviewSummary({ preview }: { preview: SettlementPreview }) {
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
      <Summary label="BRL balance" value={formatBRL(preview.brlBalance)} />
      <Summary
        label="Gold balance"
        value={`${formatGold(preview.goldGramBalance)} g`}
      />
      <Summary
        label="Pending accruals"
        value={String(preview.pendingAccrualItems)}
      />
      <Summary
        label="Outstanding receipts"
        value={String(preview.outstandingReceipts)}
      />
      <Summary label="Can close" value={preview.canClose ? "Yes" : "No"} />
      {visibleBlockingReasons.length > 0 ? (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800 sm:col-span-2 lg:col-span-4">
          <span className="font-semibold">Blocking reasons:</span>{" "}
          {visibleBlockingReasons.map(formatReason).join(", ")}
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
}) {
  const zeroGold = useZeroGold(collaboratorId);
  const payout = usePartialPayout(collaboratorId);
  const finalTenantPayment = useFinalTenantPayment(collaboratorId);
  const finalCollaboratorPayment = useFinalCollaboratorPayment(collaboratorId);
  const closeJourney = useCloseJourney(collaboratorId, () =>
    onJourneyClosed?.("Journey closed successfully."),
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
    if (action === "FINAL_TENANT_PAYMENT") {
      const result = await finalTenantPayment.mutateAsync(base);
      onSuccess(
        "Final Tenant payment posted. Collaborator receipt acceptance is required before Journey closure.",
        result.ledgerEntries.map((entry) => entry.id),
      );
      return;
    }
    if (action === "FINAL_COLLABORATOR_PAYMENT") {
      const result = await finalCollaboratorPayment.mutateAsync(base);
      onSuccess(
        "Collaborator payment recorded. Tenant receipt acceptance is required before Journey closure.",
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
              This action uses the actor identified by the authenticated session.
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
            Primary actor: {primaryActorId || "Loading authenticated actor…"}
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
function actionTitle(action: SensitiveAction) {
  if (action === "ZERO_GOLD") return "Zero Gold Balance";
  if (action === "PARTIAL_PAYOUT") return "Partial Payout";
  if (action === "FINAL_TENANT_PAYMENT") return "Final Tenant Payment";
  if (action === "FINAL_COLLABORATOR_PAYMENT") return "Record Collaborator Final Payment";
  return "Close Journey";
}
function actionButton(action: SensitiveAction) {
  if (action === "ZERO_GOLD") return "Post Gold Payout";
  if (action === "PARTIAL_PAYOUT") return "Post Payout";
  if (action === "FINAL_TENANT_PAYMENT") return "Post Final Tenant Payment";
  if (action === "FINAL_COLLABORATOR_PAYMENT") return "Record Final Collaborator Payment";
  return "Close Journey";
}
function actionDescription(action: SensitiveAction, preview: SettlementPreview) {
  if (action === "ZERO_GOLD")
    return `Pay the full positive gold balance of ${formatGold(preview.goldGramBalance)} g.`;
  if (action === "PARTIAL_PAYOUT")
    return "Pay part of the available BRL and/or gold balance.";
  if (action === "FINAL_TENANT_PAYMENT")
    return "Post the complete positive BRL and/or gold Journey balance owed by the Tenant. The Collaborator must accept each generated receipt in-app before closure.";
  if (action === "FINAL_COLLABORATOR_PAYMENT")
    return "Record the complete negative BRL and/or gold Journey balance paid by the Collaborator to the Tenant. A Tenant Administrator must accept each generated receipt in-app before closure.";
  return "Close this Journey only after every Journey balance is zero and all other blockers are cleared. Closing does not post a payment.";
}
function formatReason(value: string) {
  if (value === "NON_ZERO_BALANCE") return "non-zero balance";
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
function addDaysToISODate(value: string, days: number) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDateOnly(value: string) {
  const normalized = value.slice(0, 10);
  const date = new Date(`${normalized}T00:00:00Z`);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
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
