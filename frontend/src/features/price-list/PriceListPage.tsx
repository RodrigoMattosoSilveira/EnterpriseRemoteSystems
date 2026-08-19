import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useOptionalAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { PriceListItem, PriceListItemInput, PriceListItemType } from "../../types/priceList";
import {
  emptyPriceListItemFormValue,
  PriceListItemForm,
  type PriceListItemFormValue,
} from "./PriceListItemForm";
import {
  useCreatePriceListItem,
  useDeactivatePriceListItem,
  usePriceListItems,
  useReactivatePriceListItem,
  useUpdatePriceListItem,
} from "./usePriceList";

type CategoryFilter = "ALL" | "CANTEEN" | "ADMINISTRATIVE";

export function PriceListPage() {
  const actor = useOptionalAuthorizationContext();
  const canManageGoldPrices = Boolean(
    actor && (actor.permissions.includes("*") || actor.permissions.includes("gold_prices.manage")),
  );
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [createForm, setCreateForm] = useState<PriceListItemFormValue>(emptyPriceListItemFormValue);
  const [editing, setEditing] = useState<PriceListItem | null>(null);
  const [editForm, setEditForm] = useState<PriceListItemFormValue>(emptyPriceListItemFormValue);
  const [clientValidationError, setClientValidationError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const listFilter = useMemo(
    () => ({
      includeInactive,
      ...(categoryFilter === "ALL" ? {} : { itemType: categoryFilter }),
    }),
    [categoryFilter, includeInactive],
  );
  const priceListQuery = usePriceListItems(listFilter);
  const createMutation = useCreatePriceListItem();
  const updateMutation = useUpdatePriceListItem();
  const deactivateMutation = useDeactivatePriceListItem();
  const reactivateMutation = useReactivatePriceListItem();

  const rows = useMemo(
    () => [...(priceListQuery.data ?? [])].sort(comparePriceListItems),
    [priceListQuery.data],
  );
  const actionError =
    createMutation.error ??
    updateMutation.error ??
    deactivateMutation.error ??
    reactivateMutation.error;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientValidationError("");
    setSuccessMessage("");
    createMutation.reset();

    const input = formValueToInput(createForm);
    const validationError = validatePriceListItemInput(input);
    if (validationError) {
      setClientValidationError(validationError);
      return;
    }

    try {
      const created = await createMutation.mutateAsync(input);
      setCreateForm({ ...emptyPriceListItemFormValue, itemType: created.itemType as "CANTEEN" | "ADMINISTRATIVE" });
      setIsCreateFormOpen(false);
      setSuccessMessage(`Created price-list item: ${created.description}.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setClientValidationError("");
    setSuccessMessage("");
    updateMutation.reset();

    const input = formValueToInput(editForm);
    const validationError = validatePriceListItemInput(input);
    if (validationError) {
      setClientValidationError(validationError);
      return;
    }

    try {
      const updated = await updateMutation.mutateAsync({ id: editing.id, input });
      setEditing(null);
      setSuccessMessage(`Updated price-list item: ${updated.description}. The previous version was retained as inactive history.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleDeactivate(item: PriceListItem) {
    setClientValidationError("");
    setSuccessMessage("");
    deactivateMutation.reset();

    try {
      const updated = await deactivateMutation.mutateAsync(item.id);
      setSuccessMessage(`Deactivated price-list item: ${updated.description}.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleReactivate(item: PriceListItem) {
    setClientValidationError("");
    setSuccessMessage("");
    reactivateMutation.reset();

    try {
      const updated = await reactivateMutation.mutateAsync(item.id);
      setSuccessMessage(`Reactivated price-list item: ${updated.description}.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  function startEditing(item: PriceListItem) {
    setClientValidationError("");
    setSuccessMessage("");
    setEditing(item);
    setEditForm(formValueFromItem(item));
  }

  function openCreateForm() {
    setClientValidationError("");
    setSuccessMessage("");
    createMutation.reset();
    setIsCreateFormOpen(true);
  }

  function dismissCreateForm() {
    setClientValidationError("");
    createMutation.reset();
    setIsCreateFormOpen(false);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Administration
            </p>
            <h1 className="text-xl font-bold text-gray-950">Price List Items</h1>
            <p className="text-sm text-gray-500">
              Manage Canteen and Administrative items used by the New Expense workflow.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canManageGoldPrices && (
              <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
                Gold Prices
              </Link>
            )}
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              Reference Data
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/expenses/new">
              New Expense
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              Back to People
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-4">
        {successMessage && (
          <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {successMessage}
          </div>
        )}

        {clientValidationError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {clientValidationError}
          </div>
        )}

        <ApiErrorPanel error={priceListQuery.error ?? actionError} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Price List Administration</h2>
              <p className="text-sm text-gray-500">
                Add new items here. Editing an active item creates a new version and keeps the previous version for audit history.
              </p>
            </div>
            <button
              aria-expanded={isCreateFormOpen}
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white"
              onClick={isCreateFormOpen ? dismissCreateForm : openCreateForm}
              type="button"
            >
              {isCreateFormOpen ? "Hide Create Form" : "Add Price List Item"}
            </button>
          </div>
        </section>

        {isCreateFormOpen && (
          <PriceListItemForm
            title="Create Price List Item"
            description="Create an active item that can be selected on the New Expense form. The list moves down while this panel is open."
            value={createForm}
            isPending={createMutation.isPending}
            submitLabel="Create Item"
            pendingLabel="Creating..."
            onChange={setCreateForm}
            onSubmit={handleCreate}
            onCancel={dismissCreateForm}
            layout="wide"
          />
        )}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">Price List</h2>
              <p className="text-sm text-gray-500">
                Active items appear in /expenses/new. Inactive items are retained here as price history and remain linked to any existing expense snapshots.
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {rows.length} items
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="block text-sm font-semibold text-gray-700">
              Category filter
              <select
                className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
              >
                <option value="ALL">All categories</option>
                <option value="CANTEEN">Canteen</option>
                <option value="ADMINISTRATIVE">Administrative</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                checked={includeInactive}
                type="checkbox"
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              Include inactive
            </label>
          </div>

          {priceListQuery.isLoading && <p className="mt-4 text-sm text-gray-500">Loading price-list items...</p>}

          {!priceListQuery.isLoading && rows.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
              <p className="font-semibold text-gray-700">No price-list items found.</p>
              <p className="mt-1">Create a Canteen or Administrative item so expenses can use price-list pricing.</p>
            </div>
          )}

          {!priceListQuery.isLoading && rows.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">Category</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">BRL Unit Price</th>
                    <th className="p-3">Sort</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">{categoryLabel(item.itemType)}</td>
                      <td className="p-3 font-mono text-xs">{item.code}</td>
                      <td className="p-3 font-medium text-gray-950">{item.description}</td>
                      <td className="p-3">{formatBRL(item.unitPriceBrl)}</td>
                      <td className="p-3">{item.sortOrder}</td>
                      <td className="p-3">
                        <StatusBadge active={item.active} />
                      </td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          {item.active && (
                            <button
                              className="rounded-lg border px-3 py-1 text-xs font-semibold"
                              onClick={() => startEditing(item)}
                              type="button"
                            >
                              Edit
                            </button>
                          )}
                          {item.active ? (
                            <button
                              className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                              onClick={() => handleDeactivate(item)}
                              type="button"
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800"
                              onClick={() => handleReactivate(item)}
                              type="button"
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {editing && (
          <PriceListItemForm
            title={`Edit ${editing.description}`}
            description="Update the item metadata and BRL unit price. Saving creates a new active version and keeps this version inactive for audit history."
            value={editForm}
            isPending={updateMutation.isPending}
            submitLabel="Save Changes"
            pendingLabel="Saving..."
            onChange={setEditForm}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </section>
    </main>
  );
}

function formValueFromItem(item: PriceListItem): PriceListItemFormValue {
  return {
    itemType: item.itemType === "ADMINISTRATIVE" ? "ADMINISTRATIVE" : "CANTEEN",
    code: item.code,
    description: item.description,
    unitPriceBrl: String(item.unitPriceBrl),
    sortOrder: String(item.sortOrder),
  };
}

function formValueToInput(value: PriceListItemFormValue): PriceListItemInput {
  return {
    itemType: value.itemType,
    code: value.code,
    description: value.description,
    unitPriceBrl: Number(value.unitPriceBrl),
    sortOrder: Number(value.sortOrder || 0),
  };
}

function validatePriceListItemInput(input: PriceListItemInput) {
  if (!input.itemType) return "Select a category.";
  if (!input.code.trim()) return "Code is required.";
  if (!input.description.trim()) return "Description is required.";
  if (!Number.isFinite(input.unitPriceBrl) || input.unitPriceBrl <= 0) {
    return "BRL unit price must be greater than zero.";
  }
  if (!Number.isFinite(input.sortOrder)) return "Sort order must be a number.";
  return "";
}

function comparePriceListItems(a: PriceListItem, b: PriceListItem) {
  return (
    categoryLabel(a.itemType).localeCompare(categoryLabel(b.itemType)) ||
    a.sortOrder - b.sortOrder ||
    a.description.localeCompare(b.description) ||
    a.code.localeCompare(b.code)
  );
}

function categoryLabel(value: PriceListItemType) {
  return value === "ADMINISTRATIVE" ? "Administrative" : "Canteen";
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={
        active
          ? "rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
          : "rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"
      }
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}
