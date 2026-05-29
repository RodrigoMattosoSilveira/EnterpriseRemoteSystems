import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { CreateCollaboratorInput } from "../../types/collaborators";
import type { Person } from "../../types/people";
import type { ReferenceDataItem } from "../../types/referenceData";
import { usePeople } from "../people/usePeople";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import { useCreateCollaborator } from "./useCollaborators";

type FormState = {
  personId: string;
  journeyStartDate: string;
  paymentMethodId: string;
  paymentValue: string;
  sectorId: string;
  locationId: string;
  taskId: string;
  statusId: string;
  notes: string;
};

const initialForm: FormState = {
  personId: "",
  journeyStartDate: todayISODate(),
  paymentMethodId: "",
  paymentValue: "",
  sectorId: "",
  locationId: "",
  taskId: "",
  statusId: "",
  notes: "",
};

export function CreateCollaboratorPage() {
  const navigate = useNavigate();
  const peopleQuery = usePeople();
  const paymentMethodsQuery = useReferenceDataByType("method");
  const sectorsQuery = useReferenceDataByType("sector");
  const locationsQuery = useReferenceDataByType("location");
  const tasksQuery = useReferenceDataByType("task");
  const statusesQuery = useReferenceDataByType("collaborator_status");
  const createMutation = useCreateCollaborator();

  const [form, setForm] = useState<FormState>(initialForm);

  const completePeople = useMemo(() => {
    const people = Array.isArray(peopleQuery.data) ? peopleQuery.data : [];
    return people.filter((person) => person.canCreateCollaborator);
  }, [peopleQuery.data]);

  const selectedPerson = completePeople.find((person) => person.id === form.personId);

  const isLoading =
    peopleQuery.isLoading ||
    paymentMethodsQuery.isLoading ||
    sectorsQuery.isLoading ||
    locationsQuery.isLoading ||
    tasksQuery.isLoading ||
    statusesQuery.isLoading;

  const loadError =
    peopleQuery.error ||
    paymentMethodsQuery.error ||
    sectorsQuery.error ||
    locationsQuery.error ||
    tasksQuery.error ||
    statusesQuery.error;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const input: CreateCollaboratorInput = {
      personId: form.personId,
      journeyStartDate: form.journeyStartDate,
      paymentMethodId: form.paymentMethodId,
      paymentValue: Number(form.paymentValue),
      sectorId: form.sectorId,
      locationId: form.locationId,
      taskId: form.taskId,
      statusId: form.statusId,
      notes: form.notes,
    };

    try {
      const created = await createMutation.mutateAsync(input);
      navigate("/collaborators", {
        state: { flash: `Collaborator created for ${created.personName || "selected person"}.` },
      });
    } catch {
      // The mutation state renders API validation errors below.
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-4xl">
          <Link className="text-sm text-gray-500 underline" to="/collaborators">
            Back to Collaborators
          </Link>
          <h1 className="mt-3 text-2xl font-bold text-gray-950">
            New Collaborator
          </h1>
          <p className="text-sm text-gray-500">
            Create a collaborator journey from a complete Person profile.
          </p>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-4 p-4">
        {isLoading && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading collaborator setup data...
          </div>
        )}

        <ApiErrorPanel error={loadError} />
        <ApiErrorPanel error={createMutation.error} />

        {!isLoading && !loadError && (
          <form onSubmit={submit} className="space-y-5 pb-28">
            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Person</h2>
              <p className="mt-1 text-sm text-gray-500">
                Only complete Person profiles are eligible for collaborator creation.
              </p>

              <div className="mt-4">
                <Select
                  label="Person"
                  required
                  value={form.personId}
                  onChange={(value) => update("personId", value)}
                  options={completePeople.map((person) => ({
                    value: person.id,
                    label: personLabel(person),
                  }))}
                  placeholder={
                    completePeople.length > 0
                      ? "Select a complete Person"
                      : "No complete People available"
                  }
                />
              </div>

              {selectedPerson && (
                <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                  <p className="font-semibold">Selected Person is complete.</p>
                  <p>{selectedPerson.email}</p>
                </div>
              )}

              {completePeople.length === 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Complete the Address, Bank, and Emergency sections on a Person before creating a Collaborator.
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Journey</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Input
                  label="Journey Start Date"
                  required
                  type="date"
                  value={form.journeyStartDate}
                  onChange={(value) => update("journeyStartDate", value)}
                />

                <Select
                  label="Status"
                  required
                  value={form.statusId}
                  onChange={(value) => update("statusId", value)}
                  options={activeOptions(statusesQuery.data)}
                  placeholder="Select a status"
                />
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Work Assignment</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Select
                  label="Sector"
                  required
                  value={form.sectorId}
                  onChange={(value) => update("sectorId", value)}
                  options={activeOptions(sectorsQuery.data)}
                  placeholder="Select a sector"
                />
                <Select
                  label="Location"
                  required
                  value={form.locationId}
                  onChange={(value) => update("locationId", value)}
                  options={activeOptions(locationsQuery.data)}
                  placeholder="Select a location"
                />
                <Select
                  label="Task"
                  required
                  value={form.taskId}
                  onChange={(value) => update("taskId", value)}
                  options={activeOptions(tasksQuery.data)}
                  placeholder="Select a task"
                />
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Payment</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Select
                  label="Payment Method"
                  required
                  value={form.paymentMethodId}
                  onChange={(value) => update("paymentMethodId", value)}
                  options={activeOptions(paymentMethodsQuery.data)}
                  placeholder="Select a payment method"
                />
                <Input
                  label="Payment Value"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.paymentValue}
                  onChange={(value) => update("paymentValue", value)}
                />
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-950">Notes</h2>
              <label className="mt-4 block text-sm font-medium text-gray-700">
                Notes
                <textarea
                  className="mt-1 min-h-24 w-full rounded-xl border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  value={form.notes}
                  onChange={(event) => update("notes", event.target.value)}
                />
              </label>
            </section>

            <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 p-4 shadow-lg backdrop-blur">
              <div className="mx-auto flex max-w-4xl justify-end gap-3">
                <Link
                  to="/collaborators"
                  className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={createMutation.isPending || completePeople.length === 0}
                  className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createMutation.isPending ? "Creating..." : "Create Collaborator"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {required && <span className="text-red-600"> *</span>}
      <select
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  min,
  step,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {required && <span className="text-red-600"> *</span>}
      <input
        required={required}
        type={type}
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />
    </label>
  );
}

function activeOptions(items: ReferenceDataItem[] = []) {
  return items
    .filter((item) => item.active)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map((item) => ({ value: item.id, label: item.label }));
}

function personLabel(person: Person) {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return person.nickname ? `${name} (${person.nickname})` : name;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
