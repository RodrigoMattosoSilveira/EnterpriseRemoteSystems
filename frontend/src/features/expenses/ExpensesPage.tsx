import { useMemo, type ChangeEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Collaborator } from "../../types/collaborators";
import type { Expense, ExpenseListFilter } from "../../types/expenses";
import type { PriceListItem } from "../../types/priceList";
import { useCollaborators } from "../collaborators/useCollaborators";
import { usePriceListItems } from "../price-list/usePriceList";
import { useExpenses } from "./useExpenses";

const EXPENSE_PAGE_SIZE = 50;
const FILTER_OPTION_PAGE_SIZE = 200;

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const collaboratorId = searchParams.get("collaboratorId") ?? "";
  const itemType = searchParams.get("itemType") ?? "";
  const priceListItemId = searchParams.get("priceListItemId") ?? "";

  const expenseFilter = useMemo<ExpenseListFilter>(
    () => ({
      collaboratorId: collaboratorId || undefined,
      itemType: itemType || undefined,
      priceListItemId: priceListItemId || undefined,
      page,
      pageSize: EXPENSE_PAGE_SIZE,
    }),
    [collaboratorId, itemType, page, priceListItemId],
  );

  const { data, isLoading, error } = useExpenses(expenseFilter);
  const { data: collaboratorData } = useCollaborators({
    page: 1,
    pageSize: FILTER_OPTION_PAGE_SIZE,
  });
  const { data: priceListItems = [] } = usePriceListItems({ includeInactive: true });

  const expenses = data?.items ?? [];
  const total = data?.total ?? expenses.length;
  const responsePageSize = data?.pageSize ?? EXPENSE_PAGE_SIZE;
  const currentPage = data?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / responsePageSize));
  const flash = readFlash(location.state);
  const collaboratorOptions = collaboratorData?.items ?? [];
  const filteredItemOptions = itemType
    ? priceListItems.filter((item) => item.itemType === itemType)
    : priceListItems;
  const hasActiveFilters = Boolean(collaboratorId || itemType || priceListItemId);

  function setFilter(key: "collaboratorId" | "itemType" | "priceListItemId", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key === "itemType") {
      next.delete("priceListItemId");
    }
    next.delete("page");
    setSearchParams(next);
  }

  function setPage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      next.delete("page");
    } else {
      next.set("page", String(nextPage));
    }
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">
                Expense Records
              </h2>
              <p className="text-sm text-gray-500">
                Showing {expenses.length} of {total} expense records.
              </p>
            </div>

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              isLoading={isLoading}
              onPageChange={setPage}
            />
          </div>
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Collaborator
              <select
                value={collaboratorId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("collaboratorId", event.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All collaborators</option>
                {collaboratorOptions.map((collaborator) => (
                  <option key={collaborator.id} value={collaborator.id}>
                    {collaboratorDisplayName(collaborator)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Item type
              <select
                value={itemType}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("itemType", event.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All item types</option>
                <option value="CANTEEN">Canteen</option>
                <option value="ADMINISTRATIVE">Administrative</option>
              </select>
            </label>

            <label className="grid gap-1 text-sm font-medium text-gray-700">
              Item
              <select
                value={priceListItemId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("priceListItemId", event.target.value)}
                className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All items</option>
                {filteredItemOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {priceListItemLabel(item)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="mt-4 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              Clear filters
            </button>
          )}
        </section>

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading expenses...
          </div>
        )}

        {!isLoading && !error && expenses.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">No expenses found</h2>
            <p className="mt-2 text-sm text-gray-500">
              {hasActiveFilters
                ? "Adjust the collaborator or item filters to find more expense records."
                : "Record a Collaborator expense after an active Collaborator exists."}
            </p>
            {!hasActiveFilters && (
              <Link
                to="/expenses/new"
                className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
              >
                Create Expense
              </Link>
            )}
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
                    <th className="p-3">Item</th>
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
                      <td className="p-3 text-gray-700">
                        {expenseItemLabel(expense)}
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

        {!isLoading && total > responsePageSize && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              isLoading={isLoading}
              onPageChange={setPage}
            />
          </section>
        )}
      </section>
    </main>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  isLoading,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-3" aria-label="Expense pages">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={isLoading || currentPage <= 1}
        className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        Previous
      </button>
      <span className="text-sm font-medium text-gray-700">
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={isLoading || currentPage >= totalPages}
        className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        Next
      </button>
    </nav>
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
        <Info label="Item" value={expenseItemLabel(expense)} />
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
  const amount = expense.totalAmount ?? expense.amount;
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(amount)} g gold`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
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

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function collaboratorDisplayName(collaborator: Collaborator) {
  return collaborator.personNickname || collaborator.personName || collaborator.id;
}

function priceListItemLabel(item: PriceListItem) {
  const inactiveSuffix = item.active ? "" : " (inactive)";
  return `${item.description} · ${item.code}${inactiveSuffix}`;
}

function expenseItemLabel(expense: Expense) {
  if (expense.itemDescription) {
    return expense.priceListItemCode
      ? `${expense.itemDescription} · ${expense.priceListItemCode}`
      : expense.itemDescription;
  }
  return "—";
}
