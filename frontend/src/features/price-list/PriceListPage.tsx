import { useI18n, type I18nContextValue } from "../../i18n";
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
import { PageTitle } from "../../components/layout/PageHeading";

type CategoryFilter = "ALL" | "CANTEEN" | "ADMINISTRATIVE";

export function PriceListPage() {
  const { t } = useI18n();
  const actor = useOptionalAuthorizationContext();
  const hasPermission = (permission: string) =>
    Boolean(actor && (actor.permissions.includes("*") || actor.permissions.includes(permission)));
  const canManageGoldPrices = hasPermission("gold_prices.manage");
  const canCreatePriceListItems = hasPermission("price_lists.create");
  const canUpdatePriceListItems = hasPermission("price_lists.update");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [descriptionOrCodeFilter, setDescriptionOrCodeFilter] = useState("");
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

  const rows = useMemo(() => {
    const normalizedFilter = descriptionOrCodeFilter.trim().toLocaleLowerCase();
    return [...(priceListQuery.data ?? [])]
      .filter((item) => {
        if (!normalizedFilter) return true;
        return (
          item.description.toLocaleLowerCase().includes(normalizedFilter) ||
          item.code.toLocaleLowerCase().includes(normalizedFilter)
        );
      })
      .sort(comparePriceListItems);
  }, [descriptionOrCodeFilter, priceListQuery.data]);
  const actionError =
    createMutation.error ??
    updateMutation.error ??
    deactivateMutation.error ??
    reactivateMutation.error;
  const createFormIsValid = priceListItemFormIsValid(createForm);
  const editFormIsDirty = Boolean(
    editing && !priceListItemFormValuesEqual(editForm, formValueFromItem(editing)),
  );
  const editFormIsValid = priceListItemFormIsValid(editForm);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setClientValidationError("");
    setSuccessMessage("");
    createMutation.reset();

    const input = formValueToInput(createForm);
    const validationError = validatePriceListItemInput(input);
    if (validationError) {
      setClientValidationError(translatePriceValidation(validationError, t));
      return;
    }

    try {
      const created = await createMutation.mutateAsync(input);
      setCreateForm({ ...emptyPriceListItemFormValue, itemType: created.itemType as "CANTEEN" | "ADMINISTRATIVE" });
      setIsCreateFormOpen(false);
      setSuccessMessage(t("byte352.price.created", { description: created.description }));
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !editFormIsDirty) return;
    setClientValidationError("");
    setSuccessMessage("");
    updateMutation.reset();

    const input = formValueToInput(editForm);
    const validationError = validatePriceListItemInput(input);
    if (validationError) {
      setClientValidationError(translatePriceValidation(validationError, t));
      return;
    }

    try {
      const updated = await updateMutation.mutateAsync({ id: editing.id, input });
      setEditing(null);
      setSuccessMessage(t("byte352.price.updated", { description: updated.description }));
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
      setSuccessMessage(t("byte352.price.deactivated", { description: updated.description }));
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
      setSuccessMessage(t("byte352.price.reactivated", { description: updated.description }));
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
              {t("price.page.administration_b8be3d")}
            </p>
            <PageTitle>{t("price.page.price.list.items_836800")}</PageTitle>
            <p className="text-sm text-gray-500">
              {t("price.page.manage.canteen.and.administrative.items.used.by.the.new.expense.w_d8262a")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {canManageGoldPrices && (
              <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
                {t("price.page.gold.prices_d529be")}
              </Link>
            )}
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/reference-data">
              {t("price.page.reference.data_3d3f15")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/expenses/new">
              {t("price.page.new.expense_7c3ae0")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              {t("price.page.back.to.people_59f4cb")}
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
              <h2 className="text-lg font-semibold text-gray-950">{t("price.page.price.list.administration_8ae3f0")}</h2>
              <p className="text-sm text-gray-500">
                {t("price.page.add.new.items.here.editing.an.active.item.creates.a.new.version.a_440b84")}
              </p>
            </div>
            <button
              aria-expanded={isCreateFormOpen}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                canCreatePriceListItems
                  ? "bg-gray-950 text-white"
                  : "cursor-not-allowed bg-gray-200 text-gray-500"
              }`}
              disabled={!canCreatePriceListItems}
              onClick={isCreateFormOpen ? dismissCreateForm : openCreateForm}
              type="button"
            >
              {isCreateFormOpen ? t("byte352.price.hideCreate") : t("byte352.price.addItem")}
            </button>
          </div>
        </section>

        {isCreateFormOpen && canCreatePriceListItems && (
          <PriceListItemForm
            title={t("byte352.price.createTitle")}
            description={t("byte352.price.createDescription")}
            value={createForm}
            isPending={createMutation.isPending}
            isSubmitDisabled={!createFormIsValid}
            submitLabel={t("byte352.price.createItem")}
            pendingLabel={t("byte352.price.creating")}
            onChange={setCreateForm}
            onSubmit={handleCreate}
            onCancel={dismissCreateForm}
            layout="wide"
          />
        )}

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-950">{t("price.page.price.list_760d09")}</h2>
              <p className="text-sm text-gray-500">
                {t("price.page.active.items.appear.in.expenses.new.inactive.items.are.retained.h_963e8e")}
              </p>
            </div>
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
              {t("byte352.price.itemsCount", { count: rows.length })}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-end">
            <label className="block text-sm font-semibold text-gray-700">
              {t("price.page.description.or.code_64c47d")}
              <input
                className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                type="search"
                value={descriptionOrCodeFilter}
                placeholder={t("byte352.price.search")}
                onChange={(event) => setDescriptionOrCodeFilter(event.target.value)}
              />
            </label>

            <label className="block text-sm font-semibold text-gray-700">
              {t("price.page.category.filter_b5ad78")}
              <select
                className="mt-1 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as CategoryFilter)}
              >
                <option value="ALL">{t("price.page.all.categories_060be0")}</option>
                <option value="CANTEEN">{t("price.page.canteen_65336b")}</option>
                <option value="ADMINISTRATIVE">{t("price.page.administrative_67c743")}</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <input
                checked={includeInactive}
                type="checkbox"
                onChange={(event) => setIncludeInactive(event.target.checked)}
              />
              {t("price.page.include.inactive_1ccb27")}
            </label>
          </div>

          {priceListQuery.isLoading && <p className="mt-4 text-sm text-gray-500">{t("price.page.loading.price.list.items_3d6805")}</p>}

          {!priceListQuery.isLoading && rows.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
              <p className="font-semibold text-gray-700">{t("price.page.no.price.list.items.match.the.current.filters_543dc2")}</p>
              <p className="mt-1">{t("price.page.change.the.description.or.code.category.or.include.inactive.filte_c81454")}</p>
            </div>
          )}

          {!priceListQuery.isLoading && rows.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-xl border">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="p-3">{t("price.page.category_a3c686")}</th>
                    <th className="p-3">{t("price.page.code_adac69")}</th>
                    <th className="p-3">{t("price.page.description_55f8eb")}</th>
                    <th className="p-3">{t("price.page.brl.unit.price_ea89e7")}</th>
                    <th className="p-3">{t("price.page.sort_adc4e9")}</th>
                    <th className="p-3">{t("price.page.status_bae7d5")}</th>
                    <th className="p-3 text-right">{t("price.page.actions_c3cd63")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((item) => (
                    <tr key={item.id}>
                      <td className="p-3">{item.itemType === "ADMINISTRATIVE" ? t("price.page.administrative_67c743") : t("price.page.canteen_65336b")}</td>
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
                              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                                canUpdatePriceListItems
                                  ? ""
                                  : "cursor-not-allowed bg-gray-100 text-gray-400"
                              }`}
                              disabled={!canUpdatePriceListItems}
                              onClick={() => startEditing(item)}
                              type="button"
                            >
                              {t("price.page.edit_530164")}
                            </button>
                          )}
                          {item.active ? (
                            <button
                              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                                canUpdatePriceListItems
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                              }`}
                              disabled={!canUpdatePriceListItems}
                              onClick={() => handleDeactivate(item)}
                              type="button"
                            >
                              {t("price.page.deactivate_d65ded")}
                            </button>
                          ) : (
                            <button
                              className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
                                canUpdatePriceListItems
                                  ? "border-green-200 bg-green-50 text-green-800"
                                  : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                              }`}
                              disabled={!canUpdatePriceListItems}
                              onClick={() => handleReactivate(item)}
                              type="button"
                            >
                              {t("price.page.reactivate_cd28a1")}
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

        {editing && canUpdatePriceListItems && (
          <PriceListItemForm
            title={t("byte352.price.editItem", { description: editing.description })}
            description={t("byte352.price.editDescription")}
            value={editForm}
            isPending={updateMutation.isPending}
            isSubmitDisabled={!editFormIsDirty || !editFormIsValid}
            submitLabel={t("byte352.price.saveChanges")}
            pendingLabel={t("byte352.price.saving")}
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

function priceListItemFormValuesEqual(
  left: PriceListItemFormValue,
  right: PriceListItemFormValue,
) {
  return (
    left.itemType === right.itemType &&
    left.code === right.code &&
    left.description === right.description &&
    left.unitPriceBrl === right.unitPriceBrl &&
    left.sortOrder === right.sortOrder
  );
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

function priceListItemFormIsValid(value: PriceListItemFormValue) {
  return validatePriceListItemInput(formValueToInput(value)) === "";
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
  const { t } = useI18n();
  return (
    <span
      className={
        active
          ? "rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800"
          : "rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700"
      }
    >
      {active ? t("byte352.common.active") : t("byte352.common.inactive")}
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

// Presentation-only translation; the domain validation messages remain unchanged.
function translatePriceValidation(message: string, t: I18nContextValue["t"]): string {
  switch (message) {
    case "Select a category.": return t("byte352.price.validation.category");
    case "Code is required.": return t("byte352.price.validation.code");
    case "Description is required.": return t("byte352.price.validation.description");
    case "BRL unit price must be greater than zero.": return t("byte352.price.validation.unitPrice");
    case "Sort order must be a number.": return t("byte352.price.validation.sort");
    default: return message;
  }
}
