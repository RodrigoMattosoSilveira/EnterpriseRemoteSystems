import { useMemo, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { Collaborator } from "../../types/collaborators";
import type { Expense, ExpenseListFilter } from "../../types/expenses";
import type { PriceListItem } from "../../types/priceList";
import {
  useCollaborator,
  useCollaborators,
} from "../collaborators/useCollaborators";
import { usePriceListItems } from "../price-list/usePriceList";
import { receiptStatusLabel, receiptStatusTone } from "../receipts/receiptLifecycle";
import { useExpenses } from "./useExpenses";

const EXPENSE_PAGE_SIZE = 50;
const FILTER_OPTION_PAGE_SIZE = 200;

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { t } = useTranslation("expenses");
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
  const collaboratorOptionFilter = useMemo(
    () => ({
      search: collaboratorSearch || undefined,
      page: 1,
      pageSize: FILTER_OPTION_PAGE_SIZE,
    }),
    [collaboratorSearch],
  );
  const { data: collaboratorData, isFetching: collaboratorOptionsLoading } =
    useCollaborators(collaboratorOptionFilter);
  const { data: selectedCollaborator } = useCollaborator(collaboratorId);
  const { data: priceListItems = [] } = usePriceListItems({ includeInactive: true });

  const expenses = data?.items ?? [];
  const total = data?.total ?? expenses.length;
  const responsePageSize = data?.pageSize ?? EXPENSE_PAGE_SIZE;
  const currentPage = data?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / responsePageSize));
  const flash = readFlash(location.state);
  const collaboratorOptions = collaboratorData?.items ?? [];
  const showCollaboratorSuggestions = Boolean(collaboratorSearch.trim());
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
              {t("page.operations")}
            </p>
            <h1 className="text-xl font-bold text-gray-950">{t("page.title")}</h1>
            <p className="text-sm text-gray-500">
              {t("page.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              to="/people"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("page.peopleLink")}
            </Link>
            <Link
              to="/collaborators"
              className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
            >
              {t("page.collaboratorsLink")}
            </Link>
            <Link
              to="/expenses/new"
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white shadow-sm"
            >
              {t("page.addButton")}
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
                {t("page.recordsTitle")}
              </h2>
              <p className="text-sm text-gray-500">
                {t("page.recordsSummary", { shown: expenses.length, total })}
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
            <h2 className="text-lg font-semibold text-gray-950">{t("page.filtersTitle")}</h2>
            <p className="text-sm text-gray-500">{t("page.filtersDescription")}</p>
            <p className="mt-1 text-xs text-gray-500">
              {t("page.filtersHint")}
            </p>
          </div>

          <div className="grid min-w-0 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="relative min-w-0">
              <label className="grid min-w-0 gap-1 text-sm font-medium text-gray-700">
                {t("page.collaboratorSearchLabel")}
                <input
                  id="expense-collaborator-search"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={
                    showCollaboratorSuggestions
                      ? "expense-collaborator-suggestions"
                      : undefined
                  }
                  aria-expanded={showCollaboratorSuggestions}
                  value={collaboratorSearch}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setFilter("collaboratorSearch", event.target.value)
                  }
                  placeholder={t("page.collaboratorSearchPlaceholder")}
                  className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
                />
              </label>
              {showCollaboratorSuggestions && (
                <div
                  id="expense-collaborator-suggestions"
                  role="listbox"
                  aria-label={t("page.matchingCollaboratorsAriaLabel")}
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
                >
                  {collaboratorOptionsLoading ? (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      {t("page.collaboratorSuggestionsLoading")}
                    </p>
                  ) : collaboratorOptions.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      {t("page.collaboratorSuggestionsEmpty")}
                    </p>
                  ) : (
                    collaboratorOptions.map((collaborator) => (
                      <button
                        key={collaborator.id}
                        type="button"
                        role="option"
                        aria-selected={collaborator.id === collaboratorId}
                        onClick={() => setFilter("collaboratorId", collaborator.id)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                      >
                        {collaboratorDisplayName(collaborator)}
                      </button>
                    ))
                  )}
                </div>
              )}
              {collaboratorId && (
                <div
                  role="status"
                  aria-label="Selected collaborator filter"
                  className="mt-2 flex min-w-0 items-center justify-between gap-2 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-700"
                >
                  <span className="min-w-0">
                    <span className="font-semibold">{t("page.selectedLabel")}</span>{" "}
                    <span className="break-words">
                      {selectedCollaborator
                        ? collaboratorDisplayName(selectedCollaborator)
                        : "Loading collaborator…"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilter("collaboratorId", "")}
                    className="shrink-0 rounded-lg border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700"
                  >
                    {t("page.removeButton")}
                  </button>
                </div>
              )}
            </div>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-gray-700">
              {t("page.categoryLabel")}
              <select
                value={itemType}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("itemType", event.target.value)}
                className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">{t("page.categoryAll")}</option>
                <option value="CANTEEN">{t("categories.canteen")}</option>
                <option value="ADMINISTRATIVE">{t("categories.administrative")}</option>
              </select>
            </label>

            <label className="grid min-w-0 gap-1 text-sm font-medium text-gray-700">
              {t("page.itemLabel")}
              <select
                value={priceListItemId}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => setFilter("priceListItemId", event.target.value)}
                aria-describedby={selectedPriceListItem ? "selected-expense-item-filter-label" : undefined}
                className="w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm"
              >
                <option value="">{t("page.itemAll")}</option>
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
              {t("page.clearFilters")}
            </button>
          )}
        </section>

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            {t("page.loading")}
          </div>
        )}

        {!isLoading && !error && expenses.length === 0 && (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold">{t("page.emptyTitle")}</h2>
            <p className="mt-2 text-sm text-gray-500">
              {hasActiveFilters
                ? t("page.emptyDescriptionWithFilters")
                : t("page.emptyDescriptionWithoutFilters")}
            </p>
            {!hasActiveFilters && (
              <Link
                to="/expenses/new"
                className="mt-5 inline-block rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white"
              >
                {t("page.createExpense")}
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
                    <th className="p-3">{t("page.tableDate")}</th>
                    <th className="p-3">{t("page.tableCollaborator")}</th>
                    <th className="p-3">{t("page.tableCategory")}</th>
                    <th className="p-3">{t("page.tableItem")}</th>
                    <th className="p-3 text-right">{t("page.tableAmount")}</th>
                    <th className="p-3">{t("page.tableReceipt")}</th>
                    <th className="p-3">{t("page.tableDescription")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="p-3 text-gray-700">
                        {formatDate(expense.expenseDate, t)}
                      </td>
                      <td className="p-3">
                        <Link
                          to={`/expenses/${expense.id}`}
                          className="font-semibold text-gray-950 underline-offset-2 hover:underline"
                        >
                          {expense.collaboratorLabel || t("page.fallbackCollaborator")}
                        </Link>
                      </td>
                      <td className="p-3 text-gray-700">
                        {displayExpenseCategory(expense, t)}
                      </td>
                      <td className="p-3 text-gray-700">
                        {expenseItemLabel(expense, t)}
                      </td>
                      <td className="p-3 text-right font-semibold text-gray-950">
                        {formatExpenseAmount(expense, t)}
                      </td>
                      <td className="p-3 text-gray-700">
                        <ExpenseReceiptStatus expense={expense} />
                      </td>
                      <td className="p-3 text-gray-700">
                        {expense.description || t("units.dash")}
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
  const { t } = useTranslation("expenses");

  return (
    <nav className="flex flex-wrap items-center gap-3" aria-label="Expense pages">
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={isLoading || currentPage <= 1}
        className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("page.paginationPrevious")}
      </button>
      <span className="text-sm font-medium text-gray-700">
        {t("page.paginationPage", { current: currentPage, total: totalPages })}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={isLoading || currentPage >= totalPages}
        className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t("page.paginationNext")}
      </button>
    </nav>
  );
}

function ExpenseCard({ expense }: { expense: Expense }) {
  const { t } = useTranslation("expenses");

  return (
    <Link to={`/expenses/${expense.id}`} className="block p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-950">
            {expense.collaboratorLabel || t("page.fallbackCollaborator")}
          </h2>
          <p className="text-sm text-gray-500">
            {displayExpenseCategory(expense, t)} · {formatDate(expense.expenseDate, t)}
          </p>
        </div>
        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">
          {expense.valueUnitLabel || expense.valueUnitId}
        </span>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-gray-700">
        <Info label={t("page.tableItem")} value={expenseItemLabel(expense, t)} />
        <Info label={t("page.tableAmount")} value={formatExpenseAmount(expense, t)} />
        <Info label={t("page.tableReceipt")} value={expenseReceiptSummary(expense, t)} />
        <Info label={t("page.tableDescription")} value={expense.description || t("units.dash")} />
      </div>
    </Link>
  );
}

function ExpenseReceiptStatus({ expense }: { expense: Expense }) {
  const { t } = useTranslation("expenses");
  const posting = expense.financialPosting;
  if (!posting) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">
        {t("page.receiptMissing")}
      </span>
    );
  }

  const label = posting.outstandingReceipt
    ? t("page.receiptOutstanding", { status: receiptStatusLabel(posting.receiptStatus) })
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

function expenseReceiptSummary(expense: Expense, t: (key: string, options?: Record<string, unknown>) => string) {
  const posting = expense.financialPosting;
  if (!posting) return t("page.receiptMissing");
  const label = receiptStatusLabel(posting.receiptStatus);
  return posting.outstandingReceipt ? t("page.receiptOutstanding", { status: label }) : label;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function formatExpenseAmount(expense: Expense, t: (key: string) => string) {
  const amount = expense.totalAmount ?? expense.amount;
  const unitCode = `${expense.currencyCode || ""} ${expense.valueUnitId || ""} ${expense.valueUnitLabel || ""}`.toUpperCase();
  if (unitCode.includes("GOLD")) {
    return `${formatNumber(amount)} ${t("units.gold")}`;
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

function formatDate(value: string | undefined, t: (key: string) => string) {
  return value || t("units.dash");
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

function priceListItemLabel(item: PriceListItem) {
  const inactiveSuffix = item.active ? "" : " (inactive)";
  return `${item.description} · ${item.code}${inactiveSuffix}`;
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
