import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { Collaborator } from "../../types/collaborators";
import type { CreateExpenseInput } from "../../types/expenses";
import type { PriceListItem, PriceListItemType } from "../../types/priceList";
import { useCollaborators } from "../collaborators/useCollaborators";
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
  const collaboratorsQuery = useCollaborators();
  const priceListItemsQuery = usePriceListItems();
  const latestGoldPriceQuery = useLatestGoldPrice();
  const createMutation = useCreateExpenseWithPriceList();

  const [form, setForm] = useState<FormState>(initialForm);
  const [clientValidationError, setClientValidationError] = useState("");
  const [showEarningsModal, setShowEarningsModal] = useState(false);

  const collaborators = useMemo(
    () => collaboratorsQuery.data?.items ?? [],
    [collaboratorsQuery.data],
  );
  const activeCollaborators = useMemo(
    () => collaborators.filter(isActiveCollaborator).sort(compareCollaborators),
    [collaborators],
  );

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

  const selectedCollaborator = activeCollaborators.find(
    (row) => row.id === form.collaboratorId,
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

  const isLoading =
    collaboratorsQuery.isLoading || priceListItemsQuery.isLoading;
  const loadError = collaboratorsQuery.error || priceListItemsQuery.error;
  const hasMissingSetup =
    activeCollaborators.length === 0 || priceListItems.length === 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientValidationError("");

    if (!form.collaboratorId) {
      setClientValidationError("Select an active Collaborator.");
      return;
    }
    if (!form.itemType) {
      setClientValidationError("Select a category.");
      return;
    }
    if (!form.priceListItemId) {
      setClientValidationError(
        "Select an item description from the price list.",
      );
      return;
    }
    if (!form.currencyCode) {
      setClientValidationError("Select Real/BRL or Grams of Gold.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setClientValidationError("Quantity must be greater than zero.");
      return;
    }
    if (form.currencyCode === "GOLD_GRAM" && !selectedGoldPrice) {
      setClientValidationError(
        "A current gold price is required for Grams of Gold expenses.",
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
            flash: `Expense created for ${expense.collaboratorLabel || "Collaborator"}.`,
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
            Back to Expenses
          </Link>
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Expense deduction
            </p>
            <h1 className="text-2xl font-bold text-gray-950">New Expense</h1>
            <p className="mt-1 text-sm text-gray-500">
              Record item-based expenses from Canteen or Administrative price
              lists.
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 p-4">
        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading expense setup data...
          </div>
        )}

        <ApiErrorPanel error={loadError} />
        <ApiErrorPanel error={createMutation.error} />

        {clientValidationError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {clientValidationError}
          </div>
        )}

        {!isLoading && !loadError && hasMissingSetup && (
          <SetupWarning
            hasCollaborators={activeCollaborators.length > 0}
            hasPriceListItems={priceListItems.length > 0}
          />
        )}

        {!isLoading && !loadError && !hasMissingSetup && (
          <form
            onSubmit={submit}
            className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
          >
            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                Expense Details
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Select the Collaborator, category, price-list item, currency,
                and quantity.
              </p>
            </section>

            <label className="block text-sm font-medium text-gray-700">
              Collaborator *
              <select
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                value={form.collaboratorId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    collaboratorId: event.target.value,
                  }))
                }
              >
                <option value="">Select a Collaborator</option>
                {activeCollaborators.map((collaborator) => (
                  <option key={collaborator.id} value={collaborator.id}>
                    {collaboratorLabel(collaborator)}
                  </option>
                ))}
              </select>
            </label>

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
                  View current and future earnings
                </button>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Category *
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
                  <option value="CANTEEN">Canteen</option>
                  <option value="ADMINISTRATIVE">Administrative</option>
                </select>
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Currency *
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
                  <option value="BRL">Real / BRL</option>
                  <option value="GOLD_GRAM">Grams of Gold</option>
                </select>
              </label>
            </div>

            <label className="block text-sm font-medium text-gray-700">
              Item Description *
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
                <option value="">Select a price-list item</option>
                {filteredPriceListItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {priceListItemLabel(item)}
                  </option>
                ))}
              </select>
              {filteredPriceListItems.length === 0 && (
                <span className="mt-2 block rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                  No active {categoryLabel(form.itemType).toLowerCase()}{" "}
                  price-list items are available.
                </span>
              )}
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Quantity *
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
                  placeholder="1"
                />
              </label>

              <label className="block text-sm font-medium text-gray-700">
                Expense Date *
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
              Notes
              <textarea
                className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-950 shadow-sm"
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="Optional note about this expense"
              />
            </label>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
              <Link
                className="rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-700 shadow-sm"
                to="/expenses"
              >
                Cancel
              </Link>
              <button
                className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-gray-400"
                type="submit"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Creating..." : "Create Expense"}
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
  return (
    <section className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-950">
      <h3 className="font-semibold text-blue-950">Calculation preview</h3>
      <p className="mt-1 text-blue-900">
        Price-list item prices are stored in Real/BRL. Totals are calculated as
        unit price × quantity.
      </p>

      {!item && (
        <p className="mt-3 rounded-xl border border-blue-200 bg-white/70 p-3 font-medium">
          Select an item to preview unit price and total.
        </p>
      )}

      {item && (
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <PreviewStat label="Selected item" value={priceListItemLabel(item)} />
          <PreviewStat
            label="Stored BRL unit price"
            value={formatBRL(item.unitPriceBrl)}
          />
          <PreviewStat
            label="Selected currency unit price"
            value={preview.unitPriceLabel}
          />
          <PreviewStat label="Quantity" value={preview.quantityLabel} />
          <PreviewStat
            label="Total price"
            value={preview.totalLabel}
            emphasized
          />
          <PreviewStat label="Calculation method" value={preview.methodLabel} />
        </dl>
      )}

      {currencyCode === "GOLD_GRAM" && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-white/80 p-3 text-blue-950">
          {isGoldPriceLoading && <p>Loading latest gold price...</p>}
          {!isGoldPriceLoading && latestGoldPriceBrlPerGram && (
            <p>
              Latest gold price source: {formatBRL(latestGoldPriceBrlPerGram)}{" "}
              per gram
              {latestGoldPriceDate ? ` on ${latestGoldPriceDate}` : ""}.
              Conversion: BRL ÷ BRL per gram = grams.
            </p>
          )}
          {!isGoldPriceLoading && !latestGoldPriceBrlPerGram && (
            <p className="font-medium text-amber-900">
              A current gold price is required before this expense can be
              recorded in grams of gold.
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
  hasCollaborators,
  hasPriceListItems,
}: {
  hasCollaborators: boolean;
  hasPriceListItems: boolean;
}) {
  const missing = [
    !hasCollaborators ? "active Collaborators" : "",
    !hasPriceListItems
      ? "active Canteen or Administrative price-list items"
      : "",
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
      <p className="font-semibold">Expense setup is incomplete.</p>
      <p className="mt-1">Configure or create: {missing.join(", ")}.</p>
    </div>
  );
}

function useCreateExpenseWithPriceList() {
  return useCreateExpense();
}

function isActiveCollaborator(collaborator: Collaborator) {
  return (
    !collaborator.closedAt &&
    collaborator.statusId === "ref-collaborator-status-active"
  );
}

function compareCollaborators(a: Collaborator, b: Collaborator) {
  return collaboratorLabel(a).localeCompare(collaboratorLabel(b));
}

function comparePriceListItems(a: PriceListItem, b: PriceListItem) {
  return (
    categoryLabel(a.itemType).localeCompare(categoryLabel(b.itemType)) ||
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

function categoryLabel(value: PriceListItemType) {
  return value === "ADMINISTRATIVE" ? "Administrative" : "Canteen";
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
