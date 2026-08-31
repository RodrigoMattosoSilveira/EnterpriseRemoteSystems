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

const emptyForm: ReferenceDataInput = {
  code: "",
  label: "",
  description: "",
  active: true,
  sortOrder: 0,
  metadataJson: "",
};

export function ReferenceDataAdminPage() {
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
              Administration
            </p>
            <PageTitle>Reference Data</PageTitle>
            <p className="text-sm text-gray-500">
              Manage tenant-ready Collaborator and Person dropdown values.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/tenants">
              Tenants
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/gold-prices">
              Gold Prices
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/admin/price-list-items">
              Price List
            </Link>
            <Link className="text-sm font-semibold text-gray-700 underline" to="/people">
              Back to People
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
            Reference data type
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
          <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleCreate}>
            <h2 className="text-lg font-semibold text-gray-950">
              Create {singularReferenceDataTypeLabel(selectedType)}
            </h2>
            <ReferenceDataFields value={createForm} onChange={setCreateForm} />
            <button
              className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={createMutation.isPending}
              type="submit"
            >
              {createMutation.isPending ? "Creating..." : "Create Item"}
            </button>
          </form>

          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-950">
                  {referenceDataTypeLabel(selectedType)}
                </h2>
                <p className="text-sm text-gray-500">
                  Values are unique within tenant, type, code, and name/label.
                </p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                {items.length} items
              </span>
            </div>

            {isLoading && <p className="mt-4 text-sm text-gray-500">Loading reference data...</p>}

            {!isLoading && items.length === 0 && (
              <p className="mt-4 rounded-xl border border-dashed p-4 text-center text-sm text-gray-500">
                No reference data found for this type.
              </p>
            )}

            {!isLoading && items.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-xl border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="p-3">Code</th>
                      <th className="p-3">Name</th>
                      <th className="p-3">Sort</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
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
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <button
                              className="rounded-lg border px-3 py-1 text-xs font-semibold"
                              onClick={() => startEditing(item)}
                              type="button"
                            >
                              Edit
                            </button>
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
        </section>

        {editing && (
          <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={handleUpdate}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-950">Edit {editing.label}</h2>
              <button
                className="rounded-lg border px-3 py-1 text-xs font-semibold"
                onClick={() => setEditing(null)}
                type="button"
              >
                Cancel
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
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="block text-sm font-semibold text-gray-700">
        Code
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          value={value.code}
          onChange={(event) => onChange({ ...value, code: event.target.value })}
        />
      </label>

      <label className="block text-sm font-semibold text-gray-700">
        Name
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          value={value.label}
          onChange={(event) => onChange({ ...value, label: event.target.value })}
        />
      </label>

      <label className="block text-sm font-semibold text-gray-700 sm:col-span-2">
        Description
        <input
          className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
          value={value.description ?? ""}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
        />
      </label>

      <label className="block text-sm font-semibold text-gray-700">
        Sort Order
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
        Active
      </label>

      <label className="block text-sm font-semibold text-gray-700 sm:col-span-2">
        Metadata JSON
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
