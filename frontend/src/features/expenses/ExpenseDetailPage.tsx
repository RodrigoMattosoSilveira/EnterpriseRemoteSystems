import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Expense } from "../../types/expenses";
import { receiptStatusLabel, receiptStatusTone } from "../receipts/receiptLifecycle";
import { useExpense } from "./useExpenses";

export function ExpenseDetailPage() {
  const { id = "" } = useParams();
  const { data: expense, isLoading, error } = useExpense(id);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 p-4">
        <section className="mx-auto max-w-4xl rounded-2xl border bg-white p-5 shadow-sm">
          Loading expense...
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
          <p className="mt-4 text-gray-700">Expense not found.</p>
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
              Expense
            </p>
            <h1 className="text-2xl font-bold text-gray-950">
              {displayExpenseCategory(expense)}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {expense.collaboratorLabel || "Collaborator"} · {expense.expenseDate}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-4xl gap-4 p-4 sm:grid-cols-2">
        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Amount</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label="Amount" value={formatExpenseAmount(expense)} />
            <Info label="Value Unit" value={expense.valueUnitLabel || expense.valueUnitId} />
            <Info label="Date" value={expense.expenseDate} />
          </dl>
        </section>

        <section className="rounded-2xl border bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-950">Classification</h2>
          <dl className="mt-5 grid gap-3 text-sm">
            <Info label="Collaborator" value={expense.collaboratorLabel || expense.collaboratorId} />
            <Info label="Category" value={displayExpenseCategory(expense)} />
            <Info label="Item" value={expenseItemLabel(expense)} />
            <Info label="Description" value={expense.description || "—"} />
          </dl>
        </section>

        {hasAuditSnapshot(expense) && (
          <section className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2">
            <h2 className="text-lg font-semibold text-gray-950">Calculation Audit</h2>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="Calculation method" value={formatCalculationMethod(expense.calculationMethod)} />
              <Info label="Quantity" value={formatOptionalNumber(expense.quantity)} />
              <Info label="Unit price" value={formatUnitPrice(expense)} />
              <Info label="Total" value={formatExpenseAmount(expense)} />
              {expense.goldBrlPerGram && (
                <Info label="Gold price source" value={formatGoldPriceSource(expense)} />
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
  const posting = expense.financialPosting;

  if (!posting) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm sm:col-span-2">
        <h2 className="text-lg font-semibold text-amber-950">Financial Posting</h2>
        <p className="mt-2 text-sm text-amber-900">
          No linked ledger debit or receipt obligation was found for this expense. This should be reviewed before journey close.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">Financial Posting</h2>
          <p className="mt-1 text-sm text-gray-600">
            This expense is posted to the collaborator current account as a debit. The receipt must be returned before the deduction is fully controlled.
          </p>
        </div>
        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${receiptStatusTone(posting.receiptStatus)}`}>
          {receiptStatusLabel(posting.receiptStatus)}
        </span>
      </div>

      {posting.outstandingReceipt ? (
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900">
          Outstanding receipt: print the receipt, collect the collaborator signature, and record the signed return.
        </p>
      ) : (
        <p className="mt-4 rounded-xl bg-green-50 p-3 text-sm font-medium text-green-900">
          Receipt returned. This expense deduction has completed its receipt control.
        </p>
      )}

      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <Info label="Ledger entry" value={posting.ledgerEntryId} />
        <Info label="Direction" value={posting.direction} />
        <Info label="Entry type" value={posting.entryType} />
        <Info label="Debit amount" value={formatPostingAmount(posting.amount, posting.valueUnitCode || posting.valueUnitLabel)} />
        <Info label="Signed amount" value={formatPostingAmount(posting.signedAmount, posting.valueUnitCode || posting.valueUnitLabel)} />
        <Info label="Effective date" value={posting.effectiveDate} />
        <Info label="Receipt" value={posting.receiptNumber || posting.receiptId || "—"} />
        <Info label="Receipt status" value={receiptStatusLabel(posting.receiptStatus)} />
        <Info label="Receipt control" value={posting.outstandingReceipt ? "Outstanding" : "Complete"} />
        <Info label="Ledger source" value={`${posting.sourceType} · ${posting.sourceId}`} />
      </dl>

      <div className="mt-5 flex flex-wrap gap-3">
        <Link className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white" to={`/ledger-entries/${posting.ledgerEntryId}/receipt`}>
          Print or return receipt
        </Link>
        {posting.outstandingReceipt ? (
          <Link className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold" to="/receipts/outstanding">
            View outstanding receipts
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function formatExpenseAmount(expense: Expense) {
  const amount = expense.totalAmount ?? expense.amount;
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(amount)} g gold`;
  }
  return formatBRL(amount);
}

function displayExpenseCategory(expense: Expense) {
  if (expense.itemType === "CANTEEN") {
    return "Canteen";
  }
  if (expense.itemType === "ADMINISTRATIVE") {
    return "Administrative";
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

function formatCalculationMethod(value?: string) {
  if (value === "BRL_PRICE_LIST") return "BRL price list";
  if (value === "BRL_TO_GOLD_GRAM_LATEST_PRICE") return "BRL to grams using latest gold price";
  if (value === "LEGACY_DIRECT_ENTRY") return "Legacy direct entry";
  return value || "—";
}

function formatOptionalNumber(value?: number) {
  return typeof value === "number" ? formatNumber(value) : "—";
}

function formatUnitPrice(expense: Expense) {
  if (typeof expense.unitPriceAmount !== "number") {
    return "—";
  }
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(expense.unitPriceAmount)} g gold`;
  }
  return formatBRL(expense.unitPriceAmount);
}

function formatPostingAmount(value: number, unit?: string) {
  const normalizedUnit = (unit || "").toUpperCase();
  if (normalizedUnit.includes("GOLD")) {
    return `${formatNumber(value)} g gold`;
  }
  return formatBRL(value);
}

function formatGoldPriceSource(expense: Expense) {
  if (!expense.goldBrlPerGram) {
    return "—";
  }
  const date = expense.goldPriceDate || "latest active date";
  return `${date} · ${formatBRL(expense.goldBrlPerGram)} per gram`;
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
