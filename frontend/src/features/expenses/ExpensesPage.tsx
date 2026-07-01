import { useMemo, type ChangeEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Collaborator } from "../../types/collaborators";
import type { Expense, ExpenseListFilter } from "../../types/expenses";
import type { PriceListItem } from "../../types/priceList";
import { useCollaborators } from "../collaborators/useCollaborators";
import { usePriceListItems } from "../price-list/usePriceList";
import { receiptStatusLabel, receiptStatusTone } from "../receipts/receiptLifecycle";
import { useExpenses } from "./useExpenses";

const EXPENSE_PAGE_SIZE = 50;
const FILTER_OPTION_PAGE_SIZE = 200;

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const collaboratorId = searchParams.get("collaboratorId") ?? "";
  const collaboratorSearch = searchParams.get("collaboratorSearch") ?? "";
  const itemType = searchParams.get("itemType") ?? "";
  const priceListItemId = searchParams.get("priceListItemId") ?? "";

  const expenseFilter = useMemo<ExpenseListFilter>(
    () => ({
      collaboratorId: collaboratorId || undefined,
      collaboratorSearch: collaboratorSearch || undefined,
      itemType: itemType || undefined,
      priceListItemId: priceListItemId || undefined,
      page,
      pageSize: EXPENSE_PAGE_SIZE,
    }),
    [collaboratorId, collaboratorSearch, itemType, page, priceListItemId],
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
  const visibleCollaboratorOptions = useMemo(
    () => filterCollaboratorOptions(collaboratorOptions, collaboratorSearch, collaboratorId),
    [collaboratorId, collaboratorOptions, collaboratorSearch],
  );
  const filteredItemOptions = itemType
    ? priceListItems.filter((item) => item.itemType === itemType)
    : priceListItems;
  const selectedPriceListItem = priceListItemId
    ? priceListItems.find((item) => item.id === priceListItemId)
    : undefined;
  const hasActiveFilters = Boolean(collaboratorId || collaboratorSearch || itemType || priceListItemId);

  function setFilter(key: "collaboratorId" | "collaboratorSearch" | "itemType" | "priceListItemId", value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key === "itemType") {
      next.delete("priceListItemId");
    }
    if (key === "collaboratorSearch" && value) {
      next.delete("collaboratorId");
    }
    if (key === "collaboratorId" && value) {
      next.delete("collaboratorSearch");
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

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              to="/people"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              People
            </Link>
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
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-950">Filters</h2>
            <p className="text-sm text-gray-500">Filter expense records by collaborator name, nickname, category, or item.</p>
            <p className="mt-1 text-xs text-gray-500">
              Start typing a collaborator first name, last name, full name, or nickname to narrow both the expense list and collaborator choices.
            </p>
          </div>

          <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="grid min-w-0 gap-1 text-sm font-medium text-gray-700">
              Collaborator name or nickname
              <input
                id="expense-collaborator-search"
                type="search"
                value={collaboratorSearch}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setFilter("collaboratorSearch", event.target.value)}
                placeholder="Search by name or nickname"
                className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              />
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-gray-700">
              Collaborator
              <select
                value={collaboratorId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("collaboratorId", event.target.value)}
                className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All collaborators</option>
                {visibleCollaboratorOptions.map((collaborator) => (
                  <option key={collaborator.id} value={collaborator.id}>
                    {collaboratorDisplayName(collaborator)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-gray-700">
              Category
              <select
                value={itemType}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("itemType", event.target.value)}
                className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All categories</option>
                <option value="CANTEEN">Canteen</option>
                <option value="ADMINISTRATIVE">Administrative</option>
              </select>
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-gray-700">
              Item
              <select
                value={priceListItemId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("priceListItemId", event.target.value)}
                aria-describedby={selectedPriceListItem ? "selected-expense-item-filter-label" : undefined}
                className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">All items</option>
                {filteredItemOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {priceListItemLabel(item)}
                  </option>
                ))}
              </select>
              {selectedPriceListItem && (
                <span
                  id="selected-expense-item-filter-label"
                  data-testid="selected-expense-item-filter-label"
                  className="block max-w-full break-words rounded-xl bg-gray-50 px-3 py-2 text-xs font-medium leading-snug text-gray-600"
                >
                  {priceListItemLabel(selectedPriceListItem)}
                </span>
              )}
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
                ? "Adjust the collaborator name, collaborator, or item filters to find more expense records."
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
                    <th className="p-3">Receipt</th>
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
                        {displayExpenseCategory(expense)}
                      </td>
                      <td className="p-3 text-gray-700">
                        {expenseItemLabel(expense)}
                      </td>
                      <td className="p-3 text-right font-semibold text-gray-950">
                        {formatExpenseAmount(expense)}
                      </td>
                      <td className="p-3 text-gray-700">
                        <ExpenseReceiptStatus expense={expense} />
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
            {displayExpenseCategory(expense)} · {formatDate(expense.expenseDate)}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">
          {expense.valueUnitLabel || expense.valueUnitId}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        <Info label="Item" value={expenseItemLabel(expense)} />
        <Info label="Amount" value={formatExpenseAmount(expense)} />
        <Info label="Receipt" value={expenseReceiptSummary(expense)} />
        <Info label="Description" value={expense.description || "—"} />
      </div>
    </Link>
  );
}

function ExpenseReceiptStatus({ expense }: { expense: Expense }) {
  const posting = expense.financialPosting;
  if (!posting) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
        Missing posting
      </span>
    );
  }

  const label = posting.outstandingReceipt
    ? `Outstanding · ${receiptStatusLabel(posting.receiptStatus)}`
    : receiptStatusLabel(posting.receiptStatus);

  return (
    <Link
      to={`/ledger-entries/${posting.ledgerEntryId}/receipt`}
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold underline-offset-2 hover:underline ${receiptStatusTone(posting.receiptStatus)}`}
    >
      {label}
    </Link>
  );
}

function expenseReceiptSummary(expense: Expense) {
  const posting = expense.financialPosting;
  if (!posting) return "Missing posting";
  const label = receiptStatusLabel(posting.receiptStatus);
  return posting.outstandingReceipt ? `Outstanding · ${label}` : label;
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
  const nickname = collaborator.personNickname?.trim() ?? "";
  const legalName = collaborator.personName?.trim() ?? "";

  if (nickname && legalName && nickname !== legalName) {
    return `${nickname} · ${legalName}`;
  }
  return nickname || legalName || collaborator.id;
}

function filterCollaboratorOptions(
  collaborators: Collaborator[],
  search: string,
  selectedCollaboratorId: string,
) {
  const normalizedSearch = normalizeSearch(search);
  if (!normalizedSearch) return collaborators;

  return collaborators.filter(
    (collaborator) =>
      collaborator.id === selectedCollaboratorId ||
      collaboratorMatchesSearchPrefix(collaborator, normalizedSearch),
  );
}

function collaboratorMatchesSearchPrefix(collaborator: Collaborator, normalizedSearch: string) {
  const candidates = [
    collaborator.personNickname,
    collaborator.personName,
    ...(collaborator.personName?.split(/\s+/) ?? []),
  ];

  return candidates.some((candidate) =>
    normalizeSearch(candidate ?? "").startsWith(normalizedSearch),
  );
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function priceListItemLabel(item: PriceListItem) {
  const inactiveSuffix = item.active ? "" : " (inactive)";
  return `${item.description} · ${item.code}${inactiveSuffix}`;
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
