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
  const [personSearch, setPersonSearch] = useState("");

  const people = useMemo(
    () => (Array.isArray(peopleQuery.data) ? peopleQuery.data : []),
    [peopleQuery.data],
  );

  const completePeople = useMemo(
    () =>
      people
        .filter((person) => person.canCreateCollaborator)
        .sort((a, b) => personLabel(a).localeCompare(personLabel(b))),
    [people],
  );

  const incompletePeopleCount = people.length - completePeople.length;

  const visibleCompletePeople = useMemo(() => {
    const query = personSearch.trim().toLowerCase();
    if (!query) return completePeople;

    return completePeople.filter((person) =>
      personSearchText(person).includes(query),
    );
  }, [completePeople, personSearch]);

  const selectedPerson = completePeople.find(
    (person) => person.id === form.personId,
  );

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

  function updatePersonSearch(value: string) {
    setPersonSearch(value);

    if (
      form.personId &&
      !completePeople.some(
        (person) =>
          person.id === form.personId &&
          personSearchText(person).includes(value.trim().toLowerCase()),
      )
    ) {
      update("personId", "");
    }
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
        state: {
          flash: `Collaborator created for ${created.personName || "selected person"}.`,
        },
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
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">
                    Select a complete Person
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Only People with complete Address, Bank, and Emergency
                    sections can become Collaborators.
                  </p>
                </div>
                <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                  <span className="font-semibold">{completePeople.length}</span>{" "}
                  eligible
                  {incompletePeopleCount > 0 && (
                    <span> · {incompletePeopleCount} incomplete</span>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.4fr]">
                <Input
                  label="Search complete People"
                  value={personSearch}
                  onChange={updatePersonSearch}
                  placeholder="Search by name, nickname, CPF, or email"
                />

                <Select
                  label="Complete Person"
                  required
                  value={form.personId}
                  onChange={(value) => update("personId", value)}
                  options={visibleCompletePeople.map((person) => ({
                    value: person.id,
                    label: personLabel(person),
                  }))}
                  placeholder={personSelectPlaceholder(
                    completePeople.length,
                    visibleCompletePeople.length,
                    personSearch,
                  )}
                  disabled={visibleCompletePeople.length === 0}
                />
              </div>

              {selectedPerson && <SelectedPersonCard person={selectedPerson} />}

              {completePeople.length === 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold">
                    No complete People are available.
                  </p>
                  <p className="mt-1">
                    Complete the Address, Bank, and Emergency sections on a
                    Person before creating a Collaborator.
                  </p>
                  <Link className="mt-2 inline-block underline" to="/people">
                    Go to People
                  </Link>
                </div>
              )}

              {completePeople.length > 0 &&
                visibleCompletePeople.length === 0 && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    No complete People match your search. Clear the search to
                    see all eligible People.
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
              <h2 className="text-lg font-semibold text-gray-950">
                Work Assignment
              </h2>
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
                  disabled={
                    createMutation.isPending ||
                    completePeople.length === 0 ||
                    !form.personId
                  }
                  className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createMutation.isPending
                    ? "Creating..."
                    : "Create Collaborator"}
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function SelectedPersonCard({ person }: { person: Person }) {
  return (
    <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">Selected Person is complete.</p>
          <p className="mt-1 text-base font-semibold">{personLabel(person)}</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1 md:grid-cols-2">
            <div>
              <dt className="text-green-700">Email</dt>
              <dd>{person.email}</dd>
            </div>
            <div>
              <dt className="text-green-700">Cellular</dt>
              <dd>{person.cellular}</dd>
            </div>
            <div>
              <dt className="text-green-700">CPF</dt>
              <dd>{person.cpf}</dd>
            </div>
            <div>
              <dt className="text-green-700">Profile</dt>
              <dd>{person.profileCompletionStatus}</dd>
            </div>
          </dl>
        </div>
        <Link className="font-semibold underline" to={`/people/${person.id}`}>
          View Person
        </Link>
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  placeholder,
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      {required && <span className="text-red-600"> *</span>}
      <select
        required={required}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
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
        placeholder={placeholder}
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

function personSelectPlaceholder(
  completePeopleCount: number,
  visiblePeopleCount: number,
  search: string,
) {
  if (completePeopleCount === 0) return "No complete People available";
  if (visiblePeopleCount === 0 && search.trim())
    return "No complete People match search";
  return "Select a complete Person";
}

function personSearchText(person: Person) {
  return [
    person.firstName,
    person.lastName,
    person.nickname,
    person.email,
    person.cpf,
    person.rg,
    person.cellular,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function personLabel(person: Person) {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return person.nickname ? `${name} (${person.nickname})` : name;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
