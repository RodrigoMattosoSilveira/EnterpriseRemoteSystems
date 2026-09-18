import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useOptionalAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { Expense } from "../../types/expenses";
import { receiptStatusLabel, receiptStatusTone } from "../receipts/receiptLifecycle";
import { useCancelExpense, useExpense } from "./useExpenses";
import { PageContextHeading, PageTitle } from "../../components/layout/PageHeading";
import { useI18n, translateEnglish, type Translate } from "../../i18n";

// Stable post-Bite-30 reconciliation evidence marker: Incorrect Expenses are not edited in place.
export function ExpenseDetailPage() {
  const { t, formatCurrency, formatDate, formatNumber, formatDateTime } = useI18n();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const actor = useOptionalAuthorizationContext();
  const { data: expense, isLoading, error } = useExpense(id);
  const cancelMutation = useCancelExpense();
  const [showCorrection, setShowCorrection] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const [clientError, setClientError] = useState("");

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-4xl rounded-2xl border bg-white p-5 shadow-sm">
          {t("expense.loading")}
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-4xl">
          <Link className="text-sm font-semibold text-gray-600 underline" to="/expenses">
            {t("expense.back")}
          </Link>
          <div className="mt-4">
            <ApiErrorPanel error={error} translate={t} />
          </div>
        </section>
      </main>
    );
  }

  if (!expense) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-4xl rounded-2xl border bg-white p-5 shadow-sm">
          <Link className="text-sm font-semibold text-gray-600 underline" to="/expenses">
            {t("expense.back")}
          </Link>
          <p className="mt-4 text-gray-700">{t("expense.notFound")}</p>
        </section>
      </main>
    );
  }

  const canCorrectExpense =
    expense.active !== false &&
    actor?.scope === "TENANT" &&
    actor.roleCodes.includes("TENANT_ADMIN") &&
    (actor.permissions.includes("*") ||
      (actor.permissions.includes("expenses.update") &&
        actor.permissions.includes("expenses.create")));

  const cancelAndRecreate = async () => {
    const reason = cancellationReason.trim();
    if (!reason) {
      setClientError(t("expense.validation.cancelReason"));
      return;
    }
    setClientError("");
    try {
      await cancelMutation.mutateAsync({ id: expense.id, reason });
      navigate(`/expenses/new?copyFrom=${encodeURIComponent(expense.id)}`);
    } catch {
      // The mutation error is rendered through ApiErrorPanel.
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Link className="text-sm font-semibold text-gray-600 underline" to="/expenses">
            {t("expense.back")}
          </Link>
          <div className="mt-4">
            <PageTitle>{t("expense.title")}</PageTitle>
            <PageContextHeading>{displayExpenseCategory(expense, t)}</PageContextHeading>
            <p className="mt-1 text-sm text-gray-500">
              {expense.collaboratorLabel || t("common.collaborator")} · {formatDate(expense.expenseDate)}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-4 px-4 pt-4">
        <ApiErrorPanel error={cancelMutation.error} translate={t} />

        {clientError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {clientError}
          </div>
        )}

        {expense.cancelledAt && (
          <section className="rounded-2xl border border-gray-300 bg-gray-100 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("expense.status")}
                </p>
                <h2 className="mt-1 text-lg font-semibold text-gray-950">{t("expense.cancelled")}</h2>
              </div>
              <span className="rounded-full bg-gray-700 px-3 py-1 text-xs font-semibold text-white">
                {t("expense.historical")}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Info label={t("expense.cancelledAt")} value={formatDateTime(expense.cancelledAt)} />
              <Info label={t("expense.cancelledBy")} value={expense.cancelledBy || "—"} />
              <Info label={t("expense.reason")} value={expense.cancellationReason || "—"} />
            </dl>
          </section>
        )}

        {expense.recreatedFromExpenseId && (
          <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            {t("expense.recreatedNotice")}{" "}
            <Link
              className="font-semibold underline"
              to={`/expenses/${expense.recreatedFromExpenseId}`}
            >
              {t("expense.openCancelled")}
            </Link>
          </section>
        )}

        {canCorrectExpense && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-semibold text-amber-950">{t("expense.correct")}</h2>
            <p className="mt-2 text-sm text-amber-900">
              {t("expense.correctHelp")}
            </p>

            {!showCorrection ? (
              <button
                type="button"
                className="mt-4 rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => setShowCorrection(true)}
              >
                {t("expense.correctAction")}
              </button>
            ) : (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-amber-950">
                  {t("expense.cancellationReason")} *
                  <textarea
                    aria-label={t("expense.cancellationReason")}
                    rows={3}
                    className="mt-1 w-full resize-y rounded-xl border border-amber-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                    value={cancellationReason}
                    onChange={(event) => setCancellationReason(event.target.value)}
                    placeholder={t("expense.cancellationPlaceholder")}
                  />
                </label>
                <p className="text-xs text-amber-900">
                  {t("expense.correctionAuditHelp")}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                    disabled={cancelMutation.isPending}
                    onClick={() => void cancelAndRecreate()}
                  >
                    {cancelMutation.isPending ? t("expense.cancelling") : t("expense.cancelRecreate")}
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700"
                    disabled={cancelMutation.isPending}
                    onClick={() => {
                      setShowCorrection(false);
                      setCancellationReason("");
                      setClientError("");
                    }}
                  >
                    {t("expense.keep")}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 p-4 sm:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("expense.amountSection")}</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label={t("expense.amount")} value={formatExpenseAmount(expense, formatCurrency, formatNumber)} />
            <Info label={t("expense.valueUnit")} value={expense.valueUnitLabel || expense.valueUnitId} />
            <Info label={t("expense.date")} value={formatDate(expense.expenseDate)} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("expense.classification")}</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label={t("common.collaborator")} value={expense.collaboratorLabel || expense.collaboratorId} />
            <Info label={t("expense.category")} value={displayExpenseCategory(expense, t)} />
            <Info label={t("expense.item")} value={expenseItemLabel(expense)} />
            <Info label={t("expense.description")} value={expense.description || "—"} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2">
          <h2 className="text-lg font-semibold text-gray-950">{t("expense.financialOwnership")}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {t("expense.ownershipHelp")}
          </p>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            <Info label="Tenant" value={expense.tenantId} />
            <Info label={t("accrual.personOwner")} value={expense.personId} />
            <Info label={t("accrual.journeyProvenance")} value={expense.collaboratorId} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold"
              to={`/collaborators/${expense.collaboratorId}`}
            >
              {t("expense.openJourney")}
            </Link>
            <Link
              className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold"
              to={`/collaborators/${expense.collaboratorId}/current-account`}
            >
              {t("expense.openCurrent")}
            </Link>
          </div>
        </section>

        {hasAuditSnapshot(expense) && (
          <section className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="text-lg font-semibold text-gray-950">{t("expense.calculationAudit")}</h2>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <Info label={t("expense.calculationMethod")} value={formatCalculationMethod(expense.calculationMethod, t)} />
              <Info label={t("expense.quantity")} value={formatOptionalNumber(expense.quantity, formatNumber)} />
              <Info label={t("expense.unitPrice")} value={formatUnitPrice(expense, formatCurrency, formatNumber)} />
              <Info label={t("expense.total")} value={formatExpenseAmount(expense, formatCurrency, formatNumber)} />
              {expense.goldBrlPerGram && (
                <Info label={t("expense.goldPriceSource")} value={formatGoldPriceSource(expense, formatCurrency, t)} />
              )}
            </dl>
          </section>
        )}

        <FinancialPostingSection expense={expense} />
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium text-gray-950">{value}</span>
    </div>
  );
}

function FinancialPostingSection({ expense }: { expense: Expense }) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const posting = expense.financialPosting;

  if (!posting) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:col-span-2">
        <h2 className="text-lg font-semibold text-amber-950">{t("expense.financialPosting")}</h2>
        <p className="mt-2 text-sm text-amber-900">
          {t("expense.postingMissing")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">{t("expense.financialPosting")}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {t("expense.postingHelp")}
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${receiptStatusTone(posting.receiptStatus)}`}>
          {receiptStatusLabel(posting.receiptStatus, t)}
        </span>
      </div>

      {posting.receiptStatus === "CANCELLED" ? (
        <p className="mt-4 rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-800">
          {t("expense.receiptCancelledHelp")}
        </p>
      ) : posting.outstandingReceipt ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {t("expense.receiptOutstandingHelp")}
        </p>
      ) : (
        <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-900">
          {t("expense.receiptReturnedHelp")}
        </p>
      )}

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <Info label={t("expense.ledgerEntry")} value={posting.ledgerEntryId} />
        <Info label={t("expense.direction")} value={posting.direction} />
        <Info label={t("expense.entryType")} value={posting.entryType} />
        <Info label={t("expense.debitAmount")} value={formatPostingAmount(posting.amount, posting.valueUnitCode || posting.valueUnitLabel, formatCurrency, formatNumber)} />
        <Info label={t("expense.signedAmount")} value={formatPostingAmount(posting.signedAmount, posting.valueUnitCode || posting.valueUnitLabel, formatCurrency, formatNumber)} />
        <Info label={t("receipt.effectiveDate")} value={formatDate(posting.effectiveDate)} />
        <Info label={t("expense.receipt")} value={posting.receiptNumber || posting.receiptId || "—"} />
        <Info label={t("expense.receiptStatus")} value={receiptStatusLabel(posting.receiptStatus, t)} />
        <Info label={t("expense.receiptControl")} value={posting.outstandingReceipt ? t("expense.outstanding") : t("expense.complete")} />
        <Info label={t("expense.ledgerSource")} value={`${posting.sourceType} · ${posting.sourceId}`} />
      </dl>

      {posting.receiptStatus !== "CANCELLED" && (
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white" to={`/ledger-entries/${posting.ledgerEntryId}/receipt`}>
            {t("expense.printReturnReceipt")}
          </Link>
          {posting.outstandingReceipt ? (
            <Link className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold" to="/receipts/outstanding">
              {t("expense.viewOutstanding")}
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function formatExpenseAmount(expense: Expense, formatCurrency: (value: number, currency: string) => string, formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string) {
  const amount = expense.totalAmount ?? expense.amount;
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(amount, { maximumFractionDigits: 8 })} g gold`;
  }
  return formatCurrency(amount, "BRL");
}

function displayExpenseCategory(expense: Expense, t: Translate = translateEnglish) {
  if (expense.itemType === "CANTEEN") {
    return t("expense.canteen");
  }
  if (expense.itemType === "ADMINISTRATIVE") {
    return t("expense.administrative");
  }
  return expense.expenseCategoryLabel || expense.expenseCategoryId;
}

function expenseItemLabel(expense: Expense) {
  if (expense.itemDescription) {
    return expense.priceListItemCode
      ? `${expense.itemDescription} · ${expense.priceListItemCode}`
      : expense.itemDescription;
  }
  return "—";
}

function hasAuditSnapshot(expense: Expense) {
  return Boolean(expense.calculationMethod || expense.itemDescription || expense.quantity);
}

function formatCalculationMethod(value: string | undefined, t: Translate = translateEnglish) {
  if (value === "BRL_PRICE_LIST") return t("expense.methodBRL");
  if (value === "BRL_TO_GOLD_GRAM_LATEST_PRICE") return t("expense.methodGold");
  if (value === "LEGACY_DIRECT_ENTRY") return t("expense.legacyDirect");
  return value || "—";
}

function formatOptionalNumber(value: number | undefined, formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string) {
  return typeof value === "number" ? formatNumber(value, { maximumFractionDigits: 8 }) : "—";
}

function formatUnitPrice(expense: Expense, formatCurrency: (value: number, currency: string) => string, formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string) {
  if (typeof expense.unitPriceAmount !== "number") {
    return "—";
  }
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(expense.unitPriceAmount, { maximumFractionDigits: 8 })} g gold`;
  }
  return formatCurrency(expense.unitPriceAmount, "BRL");
}

function formatPostingAmount(value: number, unit: string | undefined, formatCurrency: (value: number, currency: string) => string, formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string) {
  const normalizedUnit = (unit || "").toUpperCase();
  if (normalizedUnit.includes("GOLD")) {
    return `${formatNumber(value, { maximumFractionDigits: 8 })} g gold`;
  }
  return formatCurrency(value, "BRL");
}

function formatGoldPriceSource(expense: Expense, formatCurrency: (value: number, currency: string) => string, t: Translate = translateEnglish) {
  if (!expense.goldBrlPerGram) {
    return "—";
  }
  const date = expense.goldPriceDate || t("expense.latestActiveDate");
  return `${date} · ${formatCurrency(expense.goldBrlPerGram, "BRL")} ${t("expense.perGram")}`;
}
