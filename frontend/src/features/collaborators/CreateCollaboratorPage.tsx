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
  const [clientValidationError, setClientValidationError] = useState("");

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

  const incompletePeople = useMemo(
    () =>
      people
        .filter((person) => !person.canCreateCollaborator)
        .sort((a, b) => personLabel(a).localeCompare(personLabel(b))),
    [people],
  );

  const incompletePeopleCount = incompletePeople.length;

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

  const paymentMethodOptions = useMemo(
    () => activeOptions(paymentMethodsQuery.data),
    [paymentMethodsQuery.data],
  );
  const sectorOptions = useMemo(
    () => activeOptions(sectorsQuery.data),
    [sectorsQuery.data],
  );
  const locationOptions = useMemo(
    () => activeOptions(locationsQuery.data),
    [locationsQuery.data],
  );
  const taskOptions = useMemo(
    () => activeOptions(tasksQuery.data),
    [tasksQuery.data],
  );
  const statusOptions = useMemo(
    () => activeOptions(statusesQuery.data),
    [statusesQuery.data],
  );

  const referenceDataGroups = [
    {
      label: "Payment Methods",
      options: paymentMethodOptions,
      total: paymentMethodsQuery.data?.length ?? 0,
    },
    {
      label: "Sectors",
      options: sectorOptions,
      total: sectorsQuery.data?.length ?? 0,
    },
    {
      label: "Locations",
      options: locationOptions,
      total: locationsQuery.data?.length ?? 0,
    },
    {
      label: "Tasks",
      options: taskOptions,
      total: tasksQuery.data?.length ?? 0,
    },
    {
      label: "Collaborator Statuses",
      options: statusOptions,
      total: statusesQuery.data?.length ?? 0,
    },
  ];

  const missingActiveReferenceData = referenceDataGroups
    .filter((group) => group.options.length === 0)
    .map((group) => group.label);

  const hasMissingActiveReferenceData = missingActiveReferenceData.length > 0;

  const paymentValue = Number(form.paymentValue);
  const canSubmit =
    Boolean(selectedPerson) &&
    Boolean(form.journeyStartDate) &&
    Boolean(form.statusId) &&
    Boolean(form.sectorId) &&
    Boolean(form.locationId) &&
    Boolean(form.taskId) &&
    Boolean(form.paymentMethodId) &&
    Number.isFinite(paymentValue) &&
    paymentValue > 0 &&
    !hasMissingActiveReferenceData;

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
    setClientValidationError("");
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

    if (!selectedPerson) {
      setClientValidationError(
        "Select a complete Person before creating a Collaborator. Incomplete People must be completed first.",
      );
      return;
    }

    if (!canSubmit) {
      setClientValidationError(
        "Complete all required Collaborator fields before submitting.",
      );
      return;
    }

    const input: CreateCollaboratorInput = {
      personId: selectedPerson.id,
      journeyStartDate: form.journeyStartDate,
      paymentMethodId: form.paymentMethodId,
      paymentValue,
      sectorId: form.sectorId,
      locationId: form.locationId,
      taskId: form.taskId,
      statusId: form.statusId,
      notes: form.notes.trim(),
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

        {clientValidationError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800">
            {clientValidationError}
          </div>
        )}

        {!isLoading && !loadError && (
          <ReferenceDataSetupSummary groups={referenceDataGroups} />
        )}

        {!isLoading && !loadError && hasMissingActiveReferenceData && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 shadow-sm">
            <p className="font-semibold">
              Active reference data is required before creating a Collaborator.
            </p>
            <p className="mt-1">
              Configure active values for:{" "}
              {missingActiveReferenceData.join(", ")}.
            </p>
            <Link
              className="mt-2 inline-block underline"
              to="/admin/reference-data"
            >
              Manage reference data
            </Link>
          </div>
        )}

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

              {incompletePeople.length > 0 && (
                <IncompletePeoplePanel people={incompletePeople} />
              )}

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
                  options={statusOptions}
                  placeholder={referencePlaceholder(
                    "status",
                    statusOptions,
                    "statuses",
                  )}
                  disabled={statusOptions.length === 0}
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
                  options={sectorOptions}
                  placeholder={referencePlaceholder("sector", sectorOptions)}
                  disabled={sectorOptions.length === 0}
                />
                <Select
                  label="Location"
                  required
                  value={form.locationId}
                  onChange={(value) => update("locationId", value)}
                  options={locationOptions}
                  placeholder={referencePlaceholder(
                    "location",
                    locationOptions,
                  )}
                  disabled={locationOptions.length === 0}
                />
                <Select
                  label="Task"
                  required
                  value={form.taskId}
                  onChange={(value) => update("taskId", value)}
                  options={taskOptions}
                  placeholder={referencePlaceholder("task", taskOptions)}
                  disabled={taskOptions.length === 0}
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
                  options={paymentMethodOptions}
                  placeholder={referencePlaceholder(
                    "payment method",
                    paymentMethodOptions,
                  )}
                  disabled={paymentMethodOptions.length === 0}
                />
                <Input
                  label="Payment Value"
                  required
                  type="number"
                  min="0.01"
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
                  disabled={createMutation.isPending || !canSubmit}
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

function ReferenceDataSetupSummary({
  groups,
}: {
  groups: {
    label: string;
    options: { value: string; label: string }[];
    total: number;
  }[];
}) {
  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-950">
            Active reference data
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Only active reference data values are available in Collaborator
            dropdowns. Inactive values are hidden.
          </p>
        </div>
        <Link
          className="text-sm font-semibold text-gray-700 underline"
          to="/admin/reference-data"
        >
          Manage reference data
        </Link>
      </div>

      <dl className="mt-4 grid gap-3 md:grid-cols-5">
        {groups.map((group) => {
          const inactiveCount = Math.max(group.total - group.options.length, 0);

          return (
            <div key={group.label} className="rounded-xl bg-gray-50 p-3">
              <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.label}
              </dt>
              <dd className="mt-1 text-sm text-gray-800">
                <span className="font-semibold text-gray-950">
                  {group.options.length}
                </span>{" "}
                active
                {inactiveCount > 0 && (
                  <span className="text-gray-500">
                    {" "}
                    · {inactiveCount} inactive
                  </span>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function IncompletePeoplePanel({ people }: { people: Person[] }) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">Incomplete People are blocked.</p>
      <p className="mt-1">
        These People cannot become Collaborators until their missing profile
        sections are completed. They are intentionally excluded from the
        complete Person selector above.
      </p>

      <ul className="mt-3 space-y-3">
        {people.map((person) => (
          <li
            key={person.id}
            className="rounded-lg border border-amber-200 bg-white/70 p-3"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="font-semibold">{personLabel(person)}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-amber-700">
                  Missing: {missingSectionsLabel(person)}
                </p>
              </div>
              <Link className="font-semibold underline" to={`/people/${person.id}`}>
                Complete Person
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
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

function referencePlaceholder(
  label: string,
  options: { value: string; label: string }[],
  pluralLabel = `${label}s`,
) {
  return options.length === 0
    ? `No active ${pluralLabel} available`
    : `Select a ${label}`;
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

function missingSectionsLabel(person: Person) {
  const sections = person.missingSections?.filter(Boolean) ?? [];
  return sections.length > 0 ? sections.join(", ") : "profile details";
}

function personLabel(person: Person) {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return person.nickname ? `${name} (${person.nickname})` : name;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
