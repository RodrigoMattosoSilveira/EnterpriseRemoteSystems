import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { Collaborator } from "../../types/collaborators";
import type { CreateExpenseInput } from "../../types/expenses";
import type { PriceListItem, PriceListItemType } from "../../types/priceList";
import { useCollaboratorSearch } from "../collaborators/useCollaborators";
import { useLatestGoldPrice } from "../gold-prices/useGoldPrices";
import { usePriceListItems } from "../price-list/usePriceList";
import { useCreateExpense } from "./useExpenses";
import { CurrentAndFutureEarningsModal } from "./CurrentAndFutureEarningsModal";

type ExpenseCurrencyCode = "BRL" | "GOLD_GRAM";
type ExpenseItemType = "CANTEEN" | "ADMINISTRATIVE";

type FormState = {
  collaboratorId: string;
  itemType: ExpenseItemType;
  priceListItemId: string;
  currencyCode: ExpenseCurrencyCode;
  quantity: string;
  expenseDate: string;
  description: string;
};

const initialForm: FormState = {
  collaboratorId: "",
  itemType: "CANTEEN",
  priceListItemId: "",
  currencyCode: "BRL",
  quantity: "1",
  expenseDate: todayISODate(),
  description: "",
};

export function CreateExpensePage() {
  const navigate = useNavigate();
  const { t } = useTranslation("expenses");
  const priceListItemsQuery = usePriceListItems();
  const latestGoldPriceQuery = useLatestGoldPrice();
  const createMutation = useCreateExpenseWithPriceList();

  const [form, setForm] = useState<FormState>(initialForm);
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [selectedCollaborator, setSelectedCollaborator] =
    useState<Collaborator | null>(null);
  const [clientValidationError, setClientValidationError] = useState("");
  const [showEarningsModal, setShowEarningsModal] = useState(false);
  const collaboratorsQuery = useCollaboratorSearch(collaboratorSearch);

  const activeCollaborators = useMemo(
    () =>
      (collaboratorsQuery.data?.items ?? [])
        .filter(isActiveCollaborator)
        .sort(compareCollaborators),
    [collaboratorsQuery.data],
  );
  const showCollaboratorSuggestions = Boolean(collaboratorSearch.trim());

  const priceListItems = useMemo(
    () =>
      (priceListItemsQuery.data ?? [])
        .filter((item) => item.active)
        .sort(comparePriceListItems),
    [priceListItemsQuery.data],
  );
  const filteredPriceListItems = useMemo(
    () => priceListItems.filter((item) => item.itemType === form.itemType),
    [form.itemType, priceListItems],
  );

  const selectedItem = priceListItems.find(
    (row) => row.id === form.priceListItemId,
  );
  const selectedGoldPrice = latestGoldPriceQuery.data;
  const quantity = Number(form.quantity);
  const calculationPreview = buildCalculationPreview(
    selectedItem,
    form.currencyCode,
    quantity,
    selectedGoldPrice?.brlPerGram,
  );

  const isLoading = priceListItemsQuery.isLoading;
  const loadError = priceListItemsQuery.error;
  const hasMissingSetup = priceListItems.length === 0;

  const selectCollaborator = (collaborator: Collaborator) => {
    setSelectedCollaborator(collaborator);
    setCollaboratorSearch("");
    setShowEarningsModal(false);
    setForm((current) => ({
      ...current,
      collaboratorId: collaborator.id,
    }));
  };

  const changeCollaboratorSearch = (value: string) => {
    setCollaboratorSearch(value);
    setSelectedCollaborator(null);
    setShowEarningsModal(false);
    setForm((current) => ({
      ...current,
      collaboratorId: "",
    }));
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientValidationError("");

    if (!form.collaboratorId) {
      setClientValidationError(t("create.validationSelectCollaborator"));
      return;
    }
    if (!form.itemType) {
      setClientValidationError(t("create.validationSelectCategory"));
      return;
    }
    if (!form.priceListItemId) {
      setClientValidationError(
        t("create.validationSelectItem"),
      );
      return;
    }
    if (!form.currencyCode) {
      setClientValidationError(t("create.validationSelectCurrency"));
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setClientValidationError(t("create.validationQuantity"));
      return;
    }
    if (form.currencyCode === "GOLD_GRAM" && !selectedGoldPrice) {
      setClientValidationError(
        t("create.validationGoldPrice"),
      );
      return;
    }

    const input: CreateExpenseInput = {
      collaboratorId: form.collaboratorId,
      priceListItemId: form.priceListItemId,
      currencyCode: form.currencyCode,
      quantity,
      expenseDate: form.expenseDate,
      description: form.description.trim(),
    };

    createMutation.mutate(input, {
      onSuccess: (expense) => {
        navigate("/expenses", {
          state: {
            flash: t("create.successFlash", { name: expense.collaboratorLabel || t("page.fallbackCollaborator") }),
          },
        });
      },
    });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <Link
            className="text-sm font-semibold text-gray-600 underline"
            to="/expenses"
          >
            {t("create.backToExpenses")}
          </Link>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("create.eyebrow")}
            </p>
            <h1 className="text-2xl font-bold text-gray-950">{t("create.title")}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {t("create.subtitle")}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 p-4">
        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            {t("create.loadingSetup")}
          </div>
        )}

        <ApiErrorPanel error={loadError} />
        <ApiErrorPanel error={collaboratorsQuery.error} />
        <ApiErrorPanel error={createMutation.error} />

        {clientValidationError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {clientValidationError}
          </div>
        )}

        {!isLoading && !loadError && hasMissingSetup && (
          <SetupWarning hasPriceListItems={priceListItems.length > 0} />
        )}

        {!isLoading && !loadError && !hasMissingSetup && (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
          >
            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                {t("create.formTitle")}
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                {t("create.formDescription")}
              </p>
            </section>

            <div className="relative">
              <label className="block text-sm font-medium text-gray-700">
                {t("create.collaboratorLabel")}
                <input
                  id="expense-create-collaborator-search"
                  type="search"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-controls={
                    showCollaboratorSuggestions
                      ? "expense-create-collaborator-suggestions"
                      : undefined
                  }
                  aria-expanded={showCollaboratorSuggestions}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                  value={collaboratorSearch}
                  onChange={(event) =>
                    changeCollaboratorSearch(event.target.value)
                  }
                  placeholder={t("create.collaboratorSearchPlaceholder")}
                />
              </label>

              {showCollaboratorSuggestions && (
                <div
                  id="expense-create-collaborator-suggestions"
                  role="listbox"
                  aria-label={t("create.matchingActiveCollaboratorsAriaLabel")}
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
                >
                  {collaboratorsQuery.isFetching ? (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      {t("create.collaboratorSuggestionsLoading")}
                    </p>
                  ) : activeCollaborators.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      {t("create.collaboratorSuggestionsEmpty")}
                    </p>
                  ) : (
                    activeCollaborators.map((collaborator) => (
                      <button
                        key={collaborator.id}
                        type="button"
                        role="option"
                        aria-selected={collaborator.id === form.collaboratorId}
                        onClick={() => selectCollaborator(collaborator)}
                        className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                      >
                        {collaboratorLabel(collaborator)}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {selectedCollaborator && (
              <div
                role="status"
                aria-label={t("create.selectedCollaboratorLabel")}
                className="flex items-center justify-between gap-3 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700"
              >
                <span className="min-w-0 break-words">
                  <span className="font-semibold">{t("create.selectedLabel")}</span>{" "}
                  {collaboratorLabel(selectedCollaborator)}
                </span>
                <button
                  type="button"
                  className="shrink-0 font-semibold underline"
                  onClick={() => changeCollaboratorSearch("")}
                >
                  {t("create.changeButton")}
                </button>
              </div>
            )}

            {selectedCollaborator && (
              <div className="flex flex-col items-start gap-1">
                <JourneyDaysRemaining
                  projectedEndDate={selectedCollaborator.projectedEndDate}
                  className="text-sm"
                />
                <button
                  className="text-left text-sm font-semibold text-gray-700 underline"
                  type="button"
                  onClick={() => setShowEarningsModal(true)}
                >
                  {t("create.viewEarningsButton")}
                </button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                {t("create.categoryLabel")}
                <select
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                  value={form.itemType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      itemType: event.target.value as ExpenseItemType,
                      priceListItemId: "",
                    }))
                  }
                >
                  <option value="CANTEEN">{t("categories.canteen")}</option>
                  <option value="ADMINISTRATIVE">{t("categories.administrative")}</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                {t("create.currencyLabel")}
                <select
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                  value={form.currencyCode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      currencyCode: event.target.value as ExpenseCurrencyCode,
                    }))
                  }
                >
                  <option value="BRL">{t("create.currencyBrl")}</option>
                  <option value="GOLD_GRAM">{t("create.currencyGold")}</option>
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium text-gray-700">
              {t("create.itemLabel")}
              <select
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                value={form.priceListItemId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priceListItemId: event.target.value,
                  }))
                }
              >
                <option value="">{t("create.itemPlaceholder")}</option>
                {filteredPriceListItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {priceListItemLabel(item)}
                  </option>
                ))}
              </select>
              {filteredPriceListItems.length === 0 && (
                <span className="mt-2 block rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  {t("create.itemEmptyState", { category: categoryLabel(form.itemType, t).toLowerCase() })}
                </span>
              )}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                {t("create.quantityLabel")}
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-950 shadow-sm"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.quantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      quantity: event.target.value,
                    }))
                  }
                  placeholder={t("create.quantityPlaceholder")}
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                {t("create.expenseDateLabel")}
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-950 shadow-sm"
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expenseDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <CalculationPreview
              currencyCode={form.currencyCode}
              item={selectedItem}
              latestGoldPriceBrlPerGram={selectedGoldPrice?.brlPerGram}
              latestGoldPriceDate={selectedGoldPrice?.priceDate}
              isGoldPriceLoading={latestGoldPriceQuery.isLoading}
              preview={calculationPreview}
            />

            <label className="block text-sm font-medium text-gray-700">
              {t("create.notesLabel")}
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-950 shadow-sm"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder={t("create.notesPlaceholder")}
              />
            </label>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <Link
                className="rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 shadow-sm"
                to="/expenses"
              >
                {t("create.cancelButton")}
              </Link>
              <button
                className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-400"
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? t("create.submittingButton") : t("create.submitButton")}
              </button>
            </div>
          </form>
        )}
      </section>

      {showEarningsModal && form.collaboratorId && (
        <CurrentAndFutureEarningsModal
          collaboratorId={form.collaboratorId}
          onClose={() => setShowEarningsModal(false)}
        />
      )}
    </main>
  );
}

function CalculationPreview({
  currencyCode,
  item,
  latestGoldPriceBrlPerGram,
  latestGoldPriceDate,
  isGoldPriceLoading,
  preview,
}: {
  currencyCode: ExpenseCurrencyCode;
  item?: PriceListItem;
  latestGoldPriceBrlPerGram?: number;
  latestGoldPriceDate?: string;
  isGoldPriceLoading: boolean;
  preview: CalculationPreviewState;
}) {
  const { t } = useTranslation("expenses");

  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
      <h3 className="font-semibold text-blue-950">{t("create.calculationPreviewTitle")}</h3>
      <p className="mt-1 text-blue-900">
        {t("create.calculationPreviewDescription")}
      </p>

      {!item && (
        <p className="mt-3 rounded-xl border border-blue-200 bg-white/70 p-3 font-medium">
          {t("create.previewSelectItem")}
        </p>
      )}

      {item && (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <PreviewStat label={t("create.previewSelectedItem")} value={priceListItemLabel(item)} />
          <PreviewStat
            label={t("create.previewStoredUnitPrice")}
            value={formatBRL(item.unitPriceBrl)}
          />
          <PreviewStat
            label={t("create.previewCurrencyUnitPrice")}
            value={preview.unitPriceLabel}
          />
          <PreviewStat label={t("create.previewQuantity")} value={preview.quantityLabel} />
          <PreviewStat
            label={t("create.previewTotalPrice")}
            value={preview.totalLabel}
            emphasized
          />
          <PreviewStat label={t("create.previewCalculationMethod")} value={preview.methodLabel} />
        </dl>
      )}

      {currencyCode === "GOLD_GRAM" && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-white/80 p-3 text-blue-950">
          {isGoldPriceLoading && <p>{t("create.loadingGoldPrice")}</p>}
          {!isGoldPriceLoading && latestGoldPriceBrlPerGram && (
            <p>
              {t("create.previewGoldPriceAvailable", { price: formatBRL(latestGoldPriceBrlPerGram), dateSuffix: latestGoldPriceDate ? ` on ${latestGoldPriceDate}` : "" })}
            </p>
          )}
          {!isGoldPriceLoading && !latestGoldPriceBrlPerGram && (
            <p className="font-medium text-amber-900">
              {t("create.previewGoldPriceMissing")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function PreviewStat({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white/80 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-blue-700">
        {label}
      </dt>
      <dd
        className={emphasized ? "mt-1 text-lg font-bold" : "mt-1 font-medium"}
      >
        {value}
      </dd>
    </div>
  );
}

function SetupWarning({
  hasPriceListItems,
}: {
  hasPriceListItems: boolean;
}) {
  const { t } = useTranslation("expenses");
  const missing = [
    !hasPriceListItems
      ? t("create.setupMissingItems")
      : "",
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
      <p className="font-semibold">{t("create.setupWarningTitle")}</p>
      <p className="mt-1">{t("create.setupWarningDescription", { missing: missing.join(", ") })}</p>
      {!hasPriceListItems && (
        <Link
          className="mt-3 inline-block font-semibold underline"
          to="/admin/price-list-items"
        >
          {t("create.managePriceListItems")}
        </Link>
      )}
    </div>
  );
}

function useCreateExpenseWithPriceList() {
  return useCreateExpense();
}

function isActiveCollaborator(collaborator: Collaborator) {
  if (collaborator.closedAt) return false;

  const statusCode = collaborator.statusCode?.trim().toUpperCase();
  if (statusCode) return statusCode === "ACTIVE";

  // Compatibility fallback for older API responses and stored test fixtures.
  return collaborator.statusId === "ref-collaborator-status-active";
}

function compareCollaborators(a: Collaborator, b: Collaborator) {
  return collaboratorLabel(a).localeCompare(collaboratorLabel(b));
}

function comparePriceListItems(a: PriceListItem, b: PriceListItem) {
  return (
    categoryLabel(a.itemType, undefined).localeCompare(categoryLabel(b.itemType, undefined)) ||
    a.sortOrder - b.sortOrder ||
    a.description.localeCompare(b.description) ||
    a.code.localeCompare(b.code)
  );
}

function collaboratorLabel(collaborator: Collaborator) {
  const primary =
    collaborator.personNickname?.trim() ||
    collaborator.personName?.trim() ||
    "Collaborator";
  const secondary = collaborator.personName?.trim();
  if (secondary && secondary !== primary) {
    return `${primary} (${secondary})`;
  }
  return primary;
}

function priceListItemLabel(item: PriceListItem) {
  return `${item.description} · ${item.code}`;
}

function categoryLabel(value: PriceListItemType, t?: (key: string) => string) {
  if (value === "ADMINISTRATIVE") {
    return t ? t("categories.administrative") : "ADMINISTRATIVE";
  }
  return t ? t("categories.canteen") : "CANTEEN";
}

type CalculationPreviewState = {
  unitPriceLabel: string;
  quantityLabel: string;
  totalLabel: string;
  methodLabel: string;
};

function buildCalculationPreview(
  item: PriceListItem | undefined,
  currencyCode: ExpenseCurrencyCode,
  quantity: number,
  latestGoldPriceBrlPerGram?: number,
): CalculationPreviewState {
  if (!item || !Number.isFinite(quantity) || quantity <= 0) {
    return {
      unitPriceLabel: "—",
      quantityLabel:
        Number.isFinite(quantity) && quantity > 0
          ? formatDecimal(quantity)
          : "—",
      totalLabel: "—",
      methodLabel:
        currencyCode === "GOLD_GRAM"
          ? "BRL to grams using latest gold price"
          : "BRL price list",
    };
  }

  if (currencyCode === "GOLD_GRAM") {
    if (!latestGoldPriceBrlPerGram || latestGoldPriceBrlPerGram <= 0) {
      return {
        unitPriceLabel: "Gold price required",
        quantityLabel: formatDecimal(quantity),
        totalLabel: "Gold price required",
        methodLabel: "BRL to grams using latest gold price",
      };
    }
    const unitPriceGold = item.unitPriceBrl / latestGoldPriceBrlPerGram;
    const totalGold = unitPriceGold * quantity;
    return {
      unitPriceLabel: `${formatDecimal(unitPriceGold, 6)} g gold`,
      quantityLabel: formatDecimal(quantity),
      totalLabel: `${formatDecimal(totalGold, 6)} g gold`,
      methodLabel: "BRL to grams using latest gold price",
    };
  }

  const totalBRL = item.unitPriceBrl * quantity;
  return {
    unitPriceLabel: formatBRL(item.unitPriceBrl),
    quantityLabel: formatDecimal(quantity),
    totalLabel: formatBRL(totalBRL),
    methodLabel: "BRL price list",
  };
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDecimal(value: number, maximumFractionDigits = 3) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
