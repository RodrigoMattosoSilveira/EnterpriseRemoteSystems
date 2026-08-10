import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Expense } from "../../types/expenses";
import { receiptStatusLabel, receiptStatusTone } from "../receipts/receiptLifecycle";
import { useExpense } from "./useExpenses";

export function ExpenseDetailPage() {
  const { id = "" } = useParams();
  const { t } = useTranslation("expenses");
  const { data: expense, isLoading, error } = useExpense(id);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-4xl rounded-2xl border bg-white p-5 shadow-sm">
          {t("detail.loading")}
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-4xl">
          <Link className="text-sm font-semibold text-gray-600 underline" to="/expenses">
            Back to Expenses
          </Link>
          <div className="mt-4">
            <ApiErrorPanel error={error} />
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
            Back to Expenses
          </Link>
          <p className="mt-4 text-gray-700">{t("page.emptyTitle")}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Link className="text-sm font-semibold text-gray-600 underline" to="/expenses">
            Back to Expenses
          </Link>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("detail.expenseLabel")}
            </p>
            <h1 className="text-2xl font-bold text-gray-950">
              {displayExpenseCategory(expense, t)}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {expense.collaboratorLabel || t("page.fallbackCollaborator")} · {expense.expenseDate}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-4xl gap-4 p-4 sm:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("detail.amountSectionTitle")}</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label={t("page.amountLabel")} value={formatExpenseAmount(expense, t)} />
            <Info label={t("page.valueUnitLabel")} value={expense.valueUnitLabel || expense.valueUnitId} />
            <Info label={t("page.dateLabel")} value={expense.expenseDate} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">{t("detail.classificationSectionTitle")}</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label={t("page.tableCollaborator")} value={expense.collaboratorLabel || expense.collaboratorId} />
            <Info label={t("page.tableCategory")} value={displayExpenseCategory(expense, t)} />
            <Info label={t("page.tableItem")} value={expenseItemLabel(expense, t)} />
            <Info label={t("detail.descriptionLabel")} value={expense.description || t("units.dash")} />
          </dl>
        </section>

        {hasAuditSnapshot(expense) && (
          <section className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="text-lg font-semibold text-gray-950">{t("detail.calculationAuditTitle")}</h2>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <Info label={t("detail.calculationMethodLabel")} value={formatCalculationMethod(expense.calculationMethod)} />
              <Info label={t("detail.quantityLabel")} value={formatOptionalNumber(expense.quantity)} />
              <Info label={t("detail.unitPriceLabel")} value={formatUnitPrice(expense)} />
              <Info label={t("detail.totalLabel")} value={formatExpenseAmount(expense, t)} />
              {expense.goldBrlPerGram && (
                <Info label={t("detail.goldPriceSourceLabel")} value={formatGoldPriceSource(expense)} />
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
  const { t } = useTranslation("expenses");
  const posting = expense.financialPosting;

  if (!posting) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:col-span-2">
        <h2 className="text-lg font-semibold text-amber-950">{t("detail.financialPostingTitle")}</h2>
        <p className="mt-2 text-sm text-amber-900">
          {t("detail.financialPostingMissing")}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">{t("detail.financialPostingTitle")}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {t("detail.financialPostingDescription")}
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${receiptStatusTone(posting.receiptStatus)}`}>
          {receiptStatusLabel(posting.receiptStatus)}
        </span>
      </div>

      {posting.outstandingReceipt ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
          {t("detail.financialPostingOutstanding")}
        </p>
      ) : (
        <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-900">
          {t("detail.financialPostingComplete")}
        </p>
      )}

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <Info label={t("detail.ledgerEntry")} value={posting.ledgerEntryId} />
        <Info label={t("detail.direction")} value={posting.direction} />
        <Info label={t("detail.entryType")} value={posting.entryType} />
        <Info label={t("detail.debitAmount")} value={formatPostingAmount(posting.amount, posting.valueUnitCode || posting.valueUnitLabel, t)} />
        <Info label={t("detail.signedAmount")} value={formatPostingAmount(posting.signedAmount, posting.valueUnitCode || posting.valueUnitLabel, t)} />
        <Info label={t("detail.effectiveDate")} value={posting.effectiveDate} />
        <Info label={t("detail.receipt")} value={posting.receiptNumber || posting.receiptId || t("units.dash")} />
        <Info label={t("detail.receiptStatus")} value={receiptStatusLabel(posting.receiptStatus)} />
        <Info label={t("detail.receiptControl")} value={posting.outstandingReceipt ? t("detail.outstanding") : t("detail.complete")} />
        <Info label={t("detail.ledgerSource")} value={`${posting.sourceType} · ${posting.sourceId}`} />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white" to={`/ledger-entries/${posting.ledgerEntryId}/receipt`}>
          {t("detail.printReturnReceipt")}
        </Link>
        {posting.outstandingReceipt ? (
          <Link className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold" to="/receipts/outstanding">
            {t("detail.viewOutstandingReceipts")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function formatExpenseAmount(expense: Expense, t: (key: string) => string) {
  const amount = expense.totalAmount ?? expense.amount;
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(amount)} ${t("units.gold")}`;
  }
  return formatBRL(amount);
}

function displayExpenseCategory(expense: Expense, t: (key: string) => string) {
  if (expense.itemType === "CANTEEN") {
    return t("categories.canteen");
  }
  if (expense.itemType === "ADMINISTRATIVE") {
    return t("categories.administrative");
  }
  return expense.expenseCategoryLabel || expense.expenseCategoryId;
}

function expenseItemLabel(expense: Expense, t: (key: string) => string) {
  if (expense.itemDescription) {
    return expense.priceListItemCode
      ? `${expense.itemDescription} · ${expense.priceListItemCode}`
      : expense.itemDescription;
  }
  return t("units.dash");
}

function hasAuditSnapshot(expense: Expense) {
  return Boolean(expense.calculationMethod || expense.itemDescription || expense.quantity);
}

function formatCalculationMethod(value?: string, t?: (key: string) => string) {
  if (value === "BRL_PRICE_LIST") return t ? t("create.previewMethodBrl") : "BRL price list";
  if (value === "BRL_TO_GOLD_GRAM_LATEST_PRICE") return t ? t("create.previewMethodGold") : "BRL to grams using latest gold price";
  if (value === "LEGACY_DIRECT_ENTRY") return "Legacy direct entry";
  return value || "—";
}

function formatOptionalNumber(value?: number) {
  return typeof value === "number" ? formatNumber(value) : "—";
}

function formatUnitPrice(expense: Expense, t: (key: string) => string) {
  if (typeof expense.unitPriceAmount !== "number") {
    return t("units.dash");
  }
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(expense.unitPriceAmount)} ${t("units.gold")}`;
  }
  return formatBRL(expense.unitPriceAmount);
}

function formatPostingAmount(value: number, unit: string | undefined, t: (key: string) => string) {
  const normalizedUnit = (unit || "").toUpperCase();
  if (normalizedUnit.includes("GOLD")) {
    return `${formatNumber(value)} ${t("units.gold")}`;
  }
  return formatBRL(value);
}

function formatGoldPriceSource(expense: Expense, t: (key: string) => string) {
  if (!expense.goldBrlPerGram) {
    return t("units.dash");
  }
  const date = expense.goldPriceDate || t("detail.goldPriceSourceFallback");
  return `${date} · ${formatBRL(expense.goldBrlPerGram)} ${t("detail.goldPriceSourceTemplate")}`;
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}
