import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Expense } from "../../types/expenses";
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
