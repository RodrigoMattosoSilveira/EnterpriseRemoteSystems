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
              {expense.expenseCategoryLabel || expense.expenseCategoryId}
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
            <Info label="Category" value={expense.expenseCategoryLabel || expense.expenseCategoryId} />
            <Info label="Description" value={expense.description || "—"} />
          </dl>
        </section>
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
  const unitCode = expense.valueUnitId.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(expense.amount)} g gold`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(expense.amount);
}
