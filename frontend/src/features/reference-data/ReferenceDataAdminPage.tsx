import { useI18n } from "../../i18n";
import { FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import {
  REFERENCE_DATA_TYPES,
  type ReferenceDataInput,
  type ReferenceDataItem,
  referenceDataTypeLabel,
} from "../../types/referenceData";
import {
  useCreateReferenceDataItem,
  useDeactivateReferenceDataItem,
  useReactivateReferenceDataItem,
  useReferenceDataByType,
  useUpdateReferenceDataItem,
} from "./useReferenceData";
import { PageTitle } from "../../components/layout/PageHeading";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";

const emptyForm: ReferenceDataInput = {
  code: "",
  label: "",
  description: "",
  active: true,
  sortOrder: 0,
  metadataJson: "",
};

export function ReferenceDataAdminPage() {
  const { t } = useI18n();
  const actor = useAuthorizationContext();
  const canManage = actor.permissions.includes("*") || actor.permissions.includes("reference_data.manage");
  const [selectedType, setSelectedType] = useState<string>(REFERENCE_DATA_TYPES[0].value);
  const [createForm, setCreateForm] = useState<ReferenceDataInput>(emptyForm);
  const [editing, setEditing] = useState<ReferenceDataItem | null>(null);
  const [editForm, setEditForm] = useState<ReferenceDataInput>(emptyForm);
  const [successMessage, setSuccessMessage] = useState("");

  const { data, isLoading, error } = useReferenceDataByType(selectedType);
  const createMutation = useCreateReferenceDataItem(selectedType);
  const updateMutation = useUpdateReferenceDataItem(selectedType);
  const deactivateMutation = useDeactivateReferenceDataItem(selectedType);
  const reactivateMutation = useReactivateReferenceDataItem(selectedType);

  const items = useMemo(() => [...(data ?? [])].sort(bySortOrderThenLabel), [data]);
  const actionError =
    createMutation.error ??
    updateMutation.error ??
    deactivateMutation.error ??
    reactivateMutation.error;

  function handleTypeChange(type: string) {
    setSelectedType(type);
    setEditing(null);
    setEditForm(emptyForm);
    setSuccessMessage("");
    createMutation.reset();
    updateMutation.reset();
    deactivateMutation.reset();
    reactivateMutation.reset();
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccessMessage("");
    createMutation.reset();

    try {
      const created = await createMutation.mutateAsync(toPayload(createForm));
      setCreateForm(emptyForm);
      setSuccessMessage(`${created.label} created.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  function startEditing(item: ReferenceDataItem) {
    setEditing(item);
    setEditForm({
      code: item.code,
      label: item.label,
      description: item.description ?? "",
      active: item.active,
      sortOrder: item.sortOrder,
      metadataJson: item.metadataJson ?? "",
    });
    setSuccessMessage("");
    updateMutation.reset();
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;

    setSuccessMessage("");
    updateMutation.reset();

    try {
      const updated = await updateMutation.mutateAsync({
        id: editing.id,
        input: toPayload(editForm),
      });
      setEditing(null);
      setEditForm(emptyForm);
      setSuccessMessage(`${updated.label} updated.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleDeactivate(item: ReferenceDataItem) {
    setSuccessMessage("");
    deactivateMutation.reset();

    try {
      const updated = await deactivateMutation.mutateAsync(item.id);
      setSuccessMessage(`${updated.label} deactivated.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  async function handleReactivate(item: ReferenceDataItem) {
    setSuccessMessage("");
    reactivateMutation.reset();

    try {
      const updated = await reactivateMutation.mutateAsync(item.id);
      setSuccessMessage(`${updated.label} reactivated.`);
    } catch {
      // Existing mutation error state is rendered by ApiErrorPanel.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("admin.reference.administration_b8be3d")}
            </p>
            <PageTitle>{t("admin.reference.reference.data_3d3f15")}</PageTitle>
            <p className="text-sm text-gray-500">
              {t("admin.reference.manage.tenant.ready.collaborator.and.person.dropdown.va_0fd8c9")}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/tenants">
              {t("admin.reference.tenants_1f7ae7")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
              {t("admin.reference.gold.prices_d529be")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              {t("admin.reference.price.list_760d09")}
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              {t("admin.reference.back.to.people_59f4cb")}
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-5xl space-y-4 p-4">
        {successMessage && (
          <div role="status" className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800">
            {successMessage}
          </div>
        )}

        <ApiErrorPanel error={error ?? actionError} />

        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700">
            {t("admin.reference.reference.data.type_1a70cf")}
            <select
              className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
              value={selectedType}
              onChange={(event) => handleTypeChange(event.target.value)}
            >
              {REFERENCE_DATA_TYPES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_2fr]">
          {canManage ? <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleCreate}>
            <h2 className="text-lg font-semibold text-gray-950">
              {t("reference.fragments.create_6e157c")} {singularReferenceDataTypeLabel(selectedType)}
            </h2>
            <ReferenceDataFields value={createForm} onChange={setCreateForm} />
            <button
              className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={createMutation.isPending}
              type="submit"
            >
              {createMutation.isPending ? "Creating..." : "Create Item"}
            </button>
          </form> : null}

          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  {referenceDataTypeLabel(selectedType)}
                </h2>
                <p className="text-sm text-gray-500">
                  {t("admin.reference.values.are.unique.within.tenant.type.code.and.name.labe_7476d5")}
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {items.length} {t("reference.fragments.items_7316c8")}
              </span>
            </div>

            {isLoading && <p className="mt-4 text-sm text-gray-500">{t("admin.reference.loading.reference.data_a8db29")}</p>}

            {!isLoading && items.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                {t("admin.reference.no.reference.data.found.for.this.type_d98014")}
              </p>
            )}

            {!isLoading && items.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="p-3">{t("admin.reference.code_adac69")}</th>
                      <th className="p-3">{t("admin.reference.name_709a23")}</th>
                      <th className="p-3">{t("admin.reference.sort_adc4e9")}</th>
                      <th className="p-3">{t("admin.reference.status_bae7d5")}</th>
                      {canManage ? <th className="p-3 text-right">{t("admin.reference.actions_c3cd63")}</th> : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.id}>
                        <td className="p-3 font-mono text-xs">{item.code}</td>
                        <td className="p-3">
                          <div className="font-medium text-gray-950">{item.label}</div>
                          {item.description && (
                            <div className="text-xs text-gray-500">{item.description}</div>
                          )}
                        </td>
                        <td className="p-3">{item.sortOrder}</td>
                        <td className="p-3">
                          <StatusBadge active={item.active} />
                        </td>
                        {canManage ? <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <button
                              className="rounded-lg border px-3 py-1 text-xs font-semibold"
                              onClick={() => startEditing(item)}
                              type="button"
                            >
                              {t("admin.reference.edit_530164")}
                            </button>
                            {item.active ? (
                              <button
                                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800"
                                onClick={() => handleDeactivate(item)}
                                type="button"
                              >
                                {t("admin.reference.deactivate_d65ded")}
                              </button>
                            ) : (
                              <button
                                className="rounded-lg border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-800"
                                onClick={() => handleReactivate(item)}
                                type="button"
                              >
                                {t("admin.reference.reactivate_cd28a1")}
                              </button>
                            )}
                          </div>
                        </td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </section>

        {canManage && editing && (
          <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleUpdate}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-950">{t("reference.fragments.edit_530164")} {editing.label}</h2>
              <button
                className="rounded-lg border px-3 py-1 text-xs font-semibold"
                onClick={() => setEditing(null)}
                type="button"
              >
                {t("admin.reference.cancel_77dfd2")}
              </button>
            </div>
            <ReferenceDataFields value={editForm} onChange={setEditForm} />
            <button
              className="mt-4 rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={updateMutation.isPending}
              type="submit"
            >
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function ReferenceDataFields({
  value,
  onChange,
}: {
  value: ReferenceDataInput;
  onChange: (value: ReferenceDataInput) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-semibold text-gray-700">
        {t("admin.reference.code_adac69")}
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          value={value.code}
          onChange={(event) => onChange({ ...value, code: event.target.value })}
        />
      </label>

      <label className="block text-sm font-semibold text-gray-700">
        {t("admin.reference.name_709a23")}
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          value={value.label}
          onChange={(event) => onChange({ ...value, label: event.target.value })}
        />
      </label>

      <label className="block text-sm font-semibold text-gray-700 sm:col-span-2">
        {t("admin.reference.description_55f8eb")}
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          value={value.description ?? ""}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>

      <label className="block text-sm font-semibold text-gray-700">
        {t("admin.reference.sort.order_5b5417")}
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          type="number"
          value={value.sortOrder}
          onChange={(event) =>
            onChange({ ...value, sortOrder: Number(event.target.value || 0) })
          }
        />
      </label>

      <label className="flex items-center gap-2 self-end text-sm font-semibold text-gray-700">
        <input
          checked={value.active ?? true}
          onChange={(event) => onChange({ ...value, active: event.target.checked })}
          type="checkbox"
        />
        {t("admin.reference.active_a733b8")}
      </label>

      <label className="block text-sm font-semibold text-gray-700 sm:col-span-2">
        {t("admin.reference.metadata.json_b0e4c2")}
        <textarea
          className="mt-1 block min-h-20 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          value={value.metadataJson ?? ""}
          onChange={(event) => onChange({ ...value, metadataJson: event.target.value })}
        />
      </label>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function singularReferenceDataTypeLabel(type: string) {
  const label = referenceDataTypeLabel(type);
  if (label.endsWith("Statuses")) return label.replace("Statuses", "Status");
  if (label.endsWith("ies")) return `${label.slice(0, -3)}y`;
  if (label.endsWith("s")) return label.slice(0, -1);
  return label;
}

function bySortOrderThenLabel(a: ReferenceDataItem, b: ReferenceDataItem) {
  return a.sortOrder - b.sortOrder || a.label.localeCompare(b.label);
}

function toPayload(input: ReferenceDataInput): ReferenceDataInput {
  return {
    code: input.code.trim(),
    label: input.label.trim(),
    description: input.description?.trim() ?? "",
    active: input.active ?? true,
    sortOrder: input.sortOrder,
    metadataJson: input.metadataJson?.trim() ?? "",
  };
}
