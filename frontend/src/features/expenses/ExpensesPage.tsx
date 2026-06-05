import { Link, useLocation } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Expense } from "../../types/expenses";
import { useExpenses } from "./useExpenses";

export function ExpensesPage() {
  const { data, isLoading, error } = useExpenses();
  const location = useLocation();
  const expenses = data?.items ?? [];
  const total = data?.total ?? expenses.length;
  const flash = readFlash(location.state);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Operations
            </p>
            <h1 className="text-xl font-bold text-gray-950">Expenses</h1>
            <p className="text-sm text-gray-500">
              Expense deductions recorded in Real or grams of gold.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/collaborators"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              Collaborators
            </Link>
            <Link
              to="/expenses/new"
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              Add
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-4 p-4">
        {flash && (
          <div
            role="status"
            className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
          >
            {flash}
          </div>
        )}

        <ApiErrorPanel error={error} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Expense Records
              </h2>
              <p className="text-sm text-gray-500">
                Showing {expenses.length} of {total} expense records.
              </p>
            </div>
          </div>
        </section>

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading expenses...
          </div>
        )}

        {!isLoading && !error && expenses.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">No expenses yet</h2>
            <p className="mt-2 text-sm text-gray-500">
              Record a Collaborator expense after an active Collaborator exists.
            </p>
            <Link
              to="/expenses/new"
              className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
            >
              Create Expense
            </Link>
          </div>
        )}

        {!isLoading && expenses.length > 0 && (
          <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
            <div className="hidden md:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Collaborator</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Amount</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="p-3 text-gray-700">
                        {formatDate(expense.expenseDate)}
                      </td>
                      <td className="p-3">
                        <Link
                          to={`/expenses/${expense.id}`}
                          className="font-semibold text-gray-950 underline-offset-2 hover:underline"
                        >
                          {expense.collaboratorLabel || "Collaborator"}
                        </Link>
                      </td>
                      <td className="p-3 text-gray-700">
                        {expense.expenseCategoryLabel || expense.expenseCategoryId}
                      </td>
                      <td className="p-3 text-right font-semibold text-gray-950">
                        {formatExpenseAmount(expense)}
                      </td>
                      <td className="p-3 text-gray-700">
                        {expense.description || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {expenses.map((expense) => (
                <ExpenseCard key={expense.id} expense={expense} />
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function ExpenseCard({ expense }: { expense: Expense }) {
  return (
    <Link to={`/expenses/${expense.id}`} className="block p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-950">
            {expense.collaboratorLabel || "Collaborator"}
          </h2>
          <p className="text-sm text-gray-500">
            {expense.expenseCategoryLabel || expense.expenseCategoryId} · {formatDate(expense.expenseDate)}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">
          {expense.valueUnitLabel || expense.valueUnitId}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        <Info label="Amount" value={formatExpenseAmount(expense)} />
        <Info label="Description" value={expense.description || "—"} />
      </div>
    </Link>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function formatExpenseAmount(expense: Expense) {
  const unitCode = expense.valueUnitId.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(expense.amount)} g gold`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(expense.amount);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value);
}

function formatDate(value?: string) {
  return value || "—";
}

function readFlash(state: unknown) {
  if (
    typeof state === "object" &&
    state !== null &&
    "flash" in state &&
    typeof state.flash === "string"
  ) {
    return state.flash;
  }
  return "";
}
