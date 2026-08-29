import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { Collaborator } from "../../types/collaborators";
import type {
  CreateCanteenExpenseBatchInput,
  CreateExpenseInput,
} from "../../types/expenses";
import type { PriceListItem, PriceListItemType } from "../../types/priceList";
import { useCollaborator, useCollaboratorSearch } from "../collaborators/useCollaborators";
import { useLatestGoldPrice } from "../gold-prices/useGoldPrices";
import { usePriceListItems } from "../price-list/usePriceList";
import {
  useCreateCanteenExpenseBatch,
  useCreateExpense,
  useExpense,
} from "./useExpenses";
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

type CanteenLineState = {
  id: number;
  priceListItemId: string;
  currencyCode: ExpenseCurrencyCode;
  quantity: string;
};

let nextCanteenLineID = 1;

function newCanteenLine(): CanteenLineState {
  return {
    id: nextCanteenLineID++,
    priceListItemId: "",
    currencyCode: "BRL",
    quantity: "1",
  };
}

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
  const [searchParams] = useSearchParams();
  const copyFromExpenseId = searchParams.get("copyFrom")?.trim() ?? "";
  const sourceExpenseQuery = useExpense(copyFromExpenseId);
  const sourceExpense = sourceExpenseQuery.data;
  const sourceCollaboratorQuery = useCollaborator(
    sourceExpense?.collaboratorId ?? "",
  );
  const priceListItemsQuery = usePriceListItems();
  const latestGoldPriceQuery = useLatestGoldPrice();
  const createMutation = useCreateExpenseWithPriceList();
  const batchCreateMutation = useCreateCanteenExpenseBatch();

  const [form, setForm] = useState<FormState>(initialForm);
  const [canteenLines, setCanteenLines] = useState<CanteenLineState[]>([
    newCanteenLine(),
  ]);
  const [collaboratorSearch, setCollaboratorSearch] = useState("");
  const [selectedCollaborator, setSelectedCollaborator] =
    useState<Collaborator | null>(null);
  const [clientValidationError, setClientValidationError] = useState("");
  const [showEarningsModal, setShowEarningsModal] = useState(false);
  const prefilledExpenseRef = useRef("");
  const collaboratorsQuery = useCollaboratorSearch(collaboratorSearch);

  useEffect(() => {
    if (
      !copyFromExpenseId ||
      !sourceExpense ||
      !sourceCollaboratorQuery.data ||
      prefilledExpenseRef.current === copyFromExpenseId
    ) {
      return;
    }
    if (sourceExpense.active !== false || !sourceExpense.cancelledAt) {
      return;
    }

    const itemType: ExpenseItemType =
      sourceExpense.itemType === "ADMINISTRATIVE" ? "ADMINISTRATIVE" : "CANTEEN";
    const currencyCode: ExpenseCurrencyCode =
      sourceExpense.currencyCode === "GOLD_GRAM" ? "GOLD_GRAM" : "BRL";

    setSelectedCollaborator(sourceCollaboratorQuery.data);
    setCollaboratorSearch("");
    setForm({
      collaboratorId: sourceExpense.collaboratorId,
      itemType,
      priceListItemId: sourceExpense.priceListItemId ?? "",
      currencyCode,
      quantity: String(sourceExpense.quantity ?? 1),
      expenseDate: sourceExpense.expenseDate || todayISODate(),
      description: sourceExpense.description ?? "",
    });
    prefilledExpenseRef.current = copyFromExpenseId;
  }, [
    copyFromExpenseId,
    sourceCollaboratorQuery.data,
    sourceExpense,
  ]);

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

  const isLoading =
    priceListItemsQuery.isLoading ||
    (Boolean(copyFromExpenseId) &&
      (sourceExpenseQuery.isLoading || sourceCollaboratorQuery.isLoading));
  const loadError =
    priceListItemsQuery.error ||
    sourceExpenseQuery.error ||
    sourceCollaboratorQuery.error;
  const hasMissingSetup = priceListItems.length === 0;
  const isCanteenBatchMode = !copyFromExpenseId && form.itemType === "CANTEEN";
  const isCreating = createMutation.isPending || batchCreateMutation.isPending;
  const replacementFormIsValid = Boolean(
    copyFromExpenseId &&
      sourceExpense?.active === false &&
      sourceExpense.cancelledAt &&
      form.collaboratorId &&
      form.itemType &&
      form.expenseDate &&
      form.priceListItemId &&
      form.currencyCode &&
      Number.isFinite(quantity) &&
      quantity > 0 &&
      (form.currencyCode !== "GOLD_GRAM" || selectedGoldPrice),
  );
  const replacementFormIsDirty = Boolean(
    copyFromExpenseId &&
      sourceExpense &&
      replacementDiffersFromSource(form, sourceExpense),
  );
  const replacementSubmitDisabled = Boolean(
    copyFromExpenseId &&
      (!replacementFormIsValid || !replacementFormIsDirty),
  );

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

  const updateCanteenLine = (
    lineID: number,
    changes: Partial<Omit<CanteenLineState, "id">>,
  ) => {
    setCanteenLines((current) =>
      current.map((line) =>
        line.id === lineID ? { ...line, ...changes } : line,
      ),
    );
  };

  const addCanteenLine = () => {
    setCanteenLines((current) =>
      current.length >= 100 ? current : [...current, newCanteenLine()],
    );
  };

  const removeCanteenLine = (lineID: number) => {
    setCanteenLines((current) =>
      current.length <= 1
        ? current
        : current.filter((line) => line.id !== lineID),
    );
  };

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
    if (!form.expenseDate) {
      setClientValidationError("Select an expense date.");
      return;
    }

    if (copyFromExpenseId && !replacementFormIsDirty) {
      setClientValidationError(
        "Change at least one Expense detail before creating the replacement.",
      );
      return;
    }

    if (isCanteenBatchMode) {
      const invalidLineIndex = canteenLines.findIndex((line) => {
        const lineQuantity = Number(line.quantity);
        return (
          !line.priceListItemId ||
          !line.currencyCode ||
          !Number.isFinite(lineQuantity) ||
          lineQuantity <= 0 ||
          (line.currencyCode === "GOLD_GRAM" && !selectedGoldPrice)
        );
      });
      if (invalidLineIndex >= 0) {
        setClientValidationError(
          `Complete Canteen item ${invalidLineIndex + 1}: select an item and currency and enter a quantity greater than zero${selectedGoldPrice ? "." : "; a current gold price is also required for Gold expenses."}`,
        );
        return;
      }

      const batchInput: CreateCanteenExpenseBatchInput = {
        collaboratorId: form.collaboratorId,
        expenseDate: form.expenseDate,
        description: form.description.trim(),
        items: canteenLines.map((line) => ({
          priceListItemId: line.priceListItemId,
          currencyCode: line.currencyCode,
          quantity: Number(line.quantity),
        })),
      };
      batchCreateMutation.mutate(batchInput, {
        onSuccess: (result) => {
          navigate("/expenses", {
            state: {
              flash:
                result.items.length === 1
                  ? `Expense created for ${result.items[0]?.collaboratorLabel || "Collaborator"}.`
                  : `${result.items.length} Canteen expenses created for ${result.items[0]?.collaboratorLabel || "Collaborator"}.`,
            },
          });
        },
      });
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
      recreatedFromExpenseId:
        sourceExpense?.cancelledAt && sourceExpense.active === false
          ? sourceExpense.id
          : undefined,
      priceListItemId: form.priceListItemId,
      currencyCode: form.currencyCode,
      quantity,
      expenseDate: form.expenseDate,
      description: form.description.trim(),
    };

    createMutation.mutate(input, {
      onSuccess: (expense) => {
        if (copyFromExpenseId) {
          navigate(`/expenses/${expense.id}`);
          return;
        }
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
            <h1 className="text-2xl font-bold text-gray-950">
              {copyFromExpenseId ? "Recreate Expense" : "New Expense"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {copyFromExpenseId
                ? "Review the cancelled Expense data and change only the incorrect fields before creating the replacement."
                : "Record multiple Canteen items in one operation, with a currency per item, or record a single Administrative expense."}
            </p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl space-y-4 p-4">
        {copyFromExpenseId &&
          sourceExpense &&
          sourceExpense.active === false &&
          sourceExpense.cancelledAt && (
            <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
              <p className="font-semibold">Replacement for cancelled Expense</p>
              <p className="mt-1">
                Fields were copied from the cancelled Expense. Correct the wrong value(s), review the calculation preview, then create the replacement.
              </p>
              <p className="mt-1">
                Create Replacement Expense stays disabled until at least one
                Expense detail differs from the cancelled source and all
                required values are valid.
              </p>
              <Link
                className="mt-2 inline-block font-semibold underline"
                to={`/expenses/${sourceExpense.id}`}
              >
                Open cancelled source
              </Link>
            </section>
          )}

        {copyFromExpenseId &&
          sourceExpense &&
          (sourceExpense.active !== false || !sourceExpense.cancelledAt) && (
            <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
              The source Expense must be cancelled before it can be recreated.
            </section>
          )}

        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading expense setup data...
          </div>
        )}

        <ApiErrorPanel error={loadError} />
        <ApiErrorPanel error={collaboratorsQuery.error} />
        <ApiErrorPanel error={createMutation.error || batchCreateMutation.error} />

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
                Expense Details
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Select the Collaborator and shared expense context. Canteen purchases may contain multiple individually recorded items.
              </p>
            </section>

            <div className="relative">
              <label className="block text-sm font-medium text-gray-700">
                Collaborator *
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
                  placeholder="Type a Collaborator name or nickname"
                />
              </label>

              {showCollaboratorSuggestions && (
                <div
                  id="expense-create-collaborator-suggestions"
                  role="listbox"
                  aria-label="Matching active collaborators"
                  className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
                >
                  {collaboratorsQuery.isFetching ? (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      Loading matching Collaborators…
                    </p>
                  ) : activeCollaborators.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-gray-500">
                      No matching active Collaborators
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
                aria-label="Selected expense Collaborator"
                className="flex items-center justify-between gap-3 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700"
              >
                <span className="min-w-0 break-words">
                  <span className="font-semibold">Selected:</span>{" "}
                  {collaboratorLabel(selectedCollaborator)}
                </span>
                <button
                  type="button"
                  className="shrink-0 font-semibold underline"
                  onClick={() => changeCollaboratorSearch("")}
                >
                  Change
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
                  onChange={(event) => {
                    const itemType = event.target.value as ExpenseItemType;
                    setForm((current) => ({
                      ...current,
                      itemType,
                      priceListItemId: "",
                      currencyCode: "BRL",
                      quantity: "1",
                    }));
                    if (itemType === "CANTEEN") {
                      setCanteenLines([newCanteenLine()]);
                    }
                  }}
                >
                  <option value="CANTEEN">Canteen</option>
                  <option value="ADMINISTRATIVE">Administrative</option>
                </select>
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

            {isCanteenBatchMode ? (
              <section className="space-y-3" aria-labelledby="canteen-items-heading">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2
                      id="canteen-items-heading"
                      className="text-lg font-semibold text-gray-950"
                    >
                      Canteen Items
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      Enter each purchased item on its own line. Every line is
                      recorded as a separate Expense, ledger debit, and receipt
                      obligation. Currency is selected per item.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                    onClick={addCanteenLine}
                    disabled={isCreating || canteenLines.length >= 100}
                  >
                    Add Canteen Item
                  </button>
                </div>

                {canteenLines.map((line, index) => {
                  const lineItem = priceListItems.find(
                    (item) => item.id === line.priceListItemId,
                  );
                  const lineQuantity = Number(line.quantity);
                  const linePreview = buildCalculationPreview(
                    lineItem,
                    line.currencyCode,
                    lineQuantity,
                    selectedGoldPrice?.brlPerGram,
                  );

                  return (
                    <fieldset
                      key={line.id}
                      className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50 p-4"
                    >
                      <legend className="px-1 font-semibold text-gray-950">
                        Canteen Item {index + 1}
                      </legend>
                      {canteenLines.length > 1 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="text-sm font-semibold text-red-700 underline disabled:text-gray-400"
                            onClick={() => removeCanteenLine(line.id)}
                            disabled={isCreating}
                          >
                            Remove
                          </button>
                        </div>
                      )}

                      <label className="block text-sm font-medium text-gray-700">
                        Item Description *
                        <select
                          aria-label={`Canteen item ${index + 1} description`}
                          className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                          value={line.priceListItemId}
                          onChange={(event) =>
                            updateCanteenLine(line.id, {
                              priceListItemId: event.target.value,
                            })
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
                            No active Canteen price-list items are available.
                          </span>
                        )}
                      </label>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-sm font-medium text-gray-700">
                          Currency *
                          <select
                            aria-label={`Canteen item ${index + 1} currency`}
                            className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                            value={line.currencyCode}
                            onChange={(event) =>
                              updateCanteenLine(line.id, {
                                currencyCode: event.target
                                  .value as ExpenseCurrencyCode,
                              })
                            }
                          >
                            <option value="BRL">Real / BRL</option>
                            <option value="GOLD_GRAM">Grams of Gold</option>
                          </select>
                        </label>

                        <label className="block text-sm font-medium text-gray-700">
                          Quantity *
                          <input
                            aria-label={`Canteen item ${index + 1} quantity`}
                            className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-950 shadow-sm"
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={line.quantity}
                            onChange={(event) =>
                              updateCanteenLine(line.id, {
                                quantity: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>

                      <CalculationPreview
                        currencyCode={line.currencyCode}
                        item={lineItem}
                        latestGoldPriceBrlPerGram={
                          selectedGoldPrice?.brlPerGram
                        }
                        latestGoldPriceDate={selectedGoldPrice?.priceDate}
                        isGoldPriceLoading={latestGoldPriceQuery.isLoading}
                        preview={linePreview}
                      />
                    </fieldset>
                  );
                })}
              </section>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Currency *
                    <select
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                      value={form.currencyCode}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          currencyCode: event.target
                            .value as ExpenseCurrencyCode,
                        }))
                      }
                    >
                      <option value="BRL">Real / BRL</option>
                      <option value="GOLD_GRAM">Grams of Gold</option>
                    </select>
                  </label>

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
                      No active {categoryLabel(form.itemType).toLowerCase()}
                      price-list items are available.
                    </span>
                  )}
                </label>

                <CalculationPreview
                  currencyCode={form.currencyCode}
                  item={selectedItem}
                  latestGoldPriceBrlPerGram={
                    selectedGoldPrice?.brlPerGram
                  }
                  latestGoldPriceDate={selectedGoldPrice?.priceDate}
                  isGoldPriceLoading={latestGoldPriceQuery.isLoading}
                  preview={calculationPreview}
                />
              </>
            )}

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
                disabled={isCreating || replacementSubmitDisabled}
              >
                {isCreating
                  ? "Creating..."
                  : copyFromExpenseId
                    ? "Create Replacement Expense"
                    : isCanteenBatchMode && canteenLines.length > 1
                      ? "Create Expenses"
                      : "Create Expense"}
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

function replacementDiffersFromSource(
  form: FormState,
  sourceExpense: {
    collaboratorId: string;
    itemType?: string;
    priceListItemId?: string;
    currencyCode?: string;
    quantity?: number;
    expenseDate: string;
    description?: string;
  },
) {
  const sourceItemType: ExpenseItemType =
    sourceExpense.itemType === "ADMINISTRATIVE" ? "ADMINISTRATIVE" : "CANTEEN";
  const sourceCurrencyCode: ExpenseCurrencyCode =
    sourceExpense.currencyCode === "GOLD_GRAM" ? "GOLD_GRAM" : "BRL";

  return (
    form.collaboratorId !== sourceExpense.collaboratorId ||
    form.itemType !== sourceItemType ||
    form.priceListItemId !== (sourceExpense.priceListItemId ?? "") ||
    form.currencyCode !== sourceCurrencyCode ||
    Number(form.quantity) !== Number(sourceExpense.quantity ?? 1) ||
    form.expenseDate !== sourceExpense.expenseDate ||
    form.description.trim() !== (sourceExpense.description ?? "").trim()
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
  hasPriceListItems,
}: {
  hasPriceListItems: boolean;
}) {
  const missing = [
    !hasPriceListItems
      ? "active Canteen or Administrative price-list items"
      : "",
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
      <p className="font-semibold">Expense setup is incomplete.</p>
      <p className="mt-1">Configure or create: {missing.join(", ")}.</p>
      {!hasPriceListItems && (
        <Link
          className="mt-3 inline-block font-semibold underline"
          to="/admin/price-list-items"
        >
          Manage Price List Items
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
