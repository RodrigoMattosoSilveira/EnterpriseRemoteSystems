import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import type { Collaborator } from "../../types/collaborators";
import type { CreateExpenseInput } from "../../types/expenses";
import type { ReferenceDataItem } from "../../types/referenceData";
import { useCollaborators } from "../collaborators/useCollaborators";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { useCreateExpense } from "./useExpenses";
import { CurrentAndFutureEarningsModal } from "./CurrentAndFutureEarningsModal";

type FormState = {
  collaboratorId: string;
  expenseCategoryId: string;
  valueUnitId: string;
  amount: string;
  expenseDate: string;
  description: string;
};

const initialForm: FormState = {
  collaboratorId: "",
  expenseCategoryId: "",
  valueUnitId: "",
  amount: "",
  expenseDate: todayISODate(),
  description: "",
};

export function CreateExpensePage() {
  const navigate = useNavigate();
  const collaboratorsQuery = useCollaborators();
  const categoriesQuery = useReferenceDataByType("expense_category");
  const valueUnitsQuery = useReferenceDataByType("value_unit");
  const createMutation = useCreateExpense();

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

  const categories = useMemo(
    () => activeReferenceRows(categoriesQuery.data ?? []),
    [categoriesQuery.data],
  );
  const valueUnits = useMemo(
    () => activeReferenceRows(valueUnitsQuery.data ?? []),
    [valueUnitsQuery.data],
  );

  const isLoading =
    collaboratorsQuery.isLoading ||
    categoriesQuery.isLoading ||
    valueUnitsQuery.isLoading;
  const loadError =
    collaboratorsQuery.error || categoriesQuery.error || valueUnitsQuery.error;
  const hasMissingSetup =
    activeCollaborators.length === 0 ||
    categories.length === 0 ||
    valueUnits.length === 0;

  const selectedCollaborator = activeCollaborators.find(
    (row) => row.id === form.collaboratorId,
  );
  const selectedValueUnit = valueUnits.find(
    (row) => row.id === form.valueUnitId,
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientValidationError("");

    const amount = Number(form.amount);
    if (!form.collaboratorId) {
      setClientValidationError("Select an active Collaborator.");
      return;
    }
    if (!form.expenseCategoryId) {
      setClientValidationError("Select an expense category.");
      return;
    }
    if (!form.valueUnitId) {
      setClientValidationError("Select Real or Gold Gram as the value unit.");
      return;
    }
    if (!form.expenseDate) {
      setClientValidationError("Enter an expense date.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setClientValidationError("Amount must be greater than zero.");
      return;
    }

    const input: CreateExpenseInput = {
      collaboratorId: form.collaboratorId,
      expenseCategoryId: form.expenseCategoryId,
      valueUnitId: form.valueUnitId,
      amount,
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
              Record expenses paid in Brazilian Real or grams of gold.
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
            hasCategories={categories.length > 0}
            hasValueUnits={valueUnits.length > 0}
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
                Pick the active Collaborator and how this deduction is
                denominated.
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

            <label className="block text-sm font-medium text-gray-700">
              Expense Category *
              <select
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                value={form.expenseCategoryId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    expenseCategoryId: event.target.value,
                  }))
                }
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Value Unit *
              <select
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-gray-950 shadow-sm"
                value={form.valueUnitId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    valueUnitId: event.target.value,
                  }))
                }
              >
                <option value="">Select Real or Gold Gram</option>
                {valueUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">
                Amount *
                <input
                  className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-gray-950 shadow-sm"
                  type="number"
                  min="0.01"
                  step={
                    selectedValueUnit?.code === "GOLD_GRAM" ? "0.001" : "0.01"
                  }
                  value={form.amount}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  placeholder={
                    selectedValueUnit?.code === "GOLD_GRAM" ? "1.250" : "100.00"
                  }
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

            <label className="block text-sm font-medium text-gray-700">
              Description
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

function SetupWarning({
  hasCollaborators,
  hasCategories,
  hasValueUnits,
}: {
  hasCollaborators: boolean;
  hasCategories: boolean;
  hasValueUnits: boolean;
}) {
  const missing = [
    !hasCollaborators ? "active Collaborators" : "",
    !hasCategories ? "expense categories" : "",
    !hasValueUnits ? "value units" : "",
  ].filter(Boolean);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
      <p className="font-semibold">Expense setup is incomplete.</p>
      <p className="mt-1">Configure or create: {missing.join(", ")}.</p>
    </div>
  );
}

function activeReferenceRows(rows: ReferenceDataItem[]) {
  return rows
    .filter((row) => row.active)
    .sort(
      (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label),
    );
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

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
