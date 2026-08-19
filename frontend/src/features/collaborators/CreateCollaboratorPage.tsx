import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type {
  Collaborator,
  CreateCollaboratorInput,
} from "../../types/collaborators";
import type { Person } from "../../types/people";
import type { ReferenceDataItem } from "../../types/referenceData";
import { usePeople } from "../people/usePeople";
import { useReferenceDataByType } from "../reference-data/useReferenceData";
import {
  paymentValueInputConfig,
  validatePaymentValueInput,
} from "./paymentValue";
import {
  useCollaboratorCandidates,
  useCollaborators,
  useCreateCollaborator,
} from "./useCollaborators";

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
  const [searchParams] = useSearchParams();
  const requestedPersonId = searchParams.get("personId")?.trim() ?? "";
  const returnHref = requestedPersonId
    ? `/people/${encodeURIComponent(requestedPersonId)}`
    : "/collaborators";
  const peopleQuery = usePeople({
    pageSize: 1000,
  });
  const candidatesQuery = useCollaboratorCandidates();
  const paymentMethodsQuery = useReferenceDataByType("method");
  const sectorsQuery = useReferenceDataByType("sector");
  const locationsQuery = useReferenceDataByType("location");
  const tasksQuery = useReferenceDataByType("task");
  const statusesQuery = useReferenceDataByType("collaborator_status");
  const collaboratorsQuery = useCollaborators();
  const createMutation = useCreateCollaborator();

  const [form, setForm] = useState<FormState>(() => ({
    ...initialForm,
    personId: requestedPersonId,
  }));
  const [personSearch, setPersonSearch] = useState("");
  const [clientValidationError, setClientValidationError] = useState("");

  const people = useMemo(
    () => (Array.isArray(peopleQuery.data) ? peopleQuery.data : []),
    [peopleQuery.data],
  );

  const collaborators = useMemo(
    () => collaboratorsQuery.data?.items ?? [],
    [collaboratorsQuery.data],
  );

  const activeCollaboratorPersonIds = useMemo(
    () =>
      new Set(
        collaborators.filter(isActiveCollaborator).map((row) => row.personId),
      ),
    [collaborators],
  );

  const completePeople = useMemo(
    () =>
      people
        .filter((person) => person.canCreateCollaborator)
        .sort((a, b) => personLabel(a).localeCompare(personLabel(b))),
    [people],
  );

  const eligiblePeople = useMemo(
    () =>
      (Array.isArray(candidatesQuery.data) ? candidatesQuery.data : []).sort(
        (a, b) => personLabel(a).localeCompare(personLabel(b)),
      ),
    [candidatesQuery.data],
  );

  const completePeopleWithActiveCollaborator = useMemo(
    () =>
      completePeople.filter((person) =>
        activeCollaboratorPersonIds.has(person.id),
      ),
    [activeCollaboratorPersonIds, completePeople],
  );

  const incompletePeopleCount = people.length - completePeople.length;

  const selectedPerson = eligiblePeople.find(
    (person) => person.id === form.personId,
  );

  const matchingEligiblePeople = useMemo(
    () => filterEligiblePeopleByNickname(eligiblePeople, personSearch),
    [eligiblePeople, personSearch],
  );
  const showPersonSuggestions = personSearch.trim().length > 0;

  const paymentMethodOptions = useMemo(
    () => activeOptions(paymentMethodsQuery.data),
    [paymentMethodsQuery.data],
  );
  const selectedPaymentMethod = paymentMethodsQuery.data?.find(
    (item) => item.id === form.paymentMethodId,
  );
  const paymentValueConfig = paymentValueInputConfig(
    selectedPaymentMethod?.code,
  );
  const paymentValueValidation = validatePaymentValueInput(
    form.paymentValue,
    paymentValueConfig,
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

  const duplicateActiveCollaboratorError = getDuplicateActiveCollaboratorError(
    createMutation.error,
  );

  const paymentValue = paymentValueValidation.value;
  const submitRequirements = [
    { met: Boolean(selectedPerson), label: "Select an eligible Person" },
    {
      met: Boolean(form.journeyStartDate),
      label: "Enter a journey start date",
    },
    { met: Boolean(form.statusId), label: "Select a status" },
    { met: Boolean(form.sectorId), label: "Select a sector" },
    { met: Boolean(form.locationId), label: "Select a location" },
    { met: Boolean(form.taskId), label: "Select a task" },
    { met: Boolean(form.paymentMethodId), label: "Select a payment method" },
    {
      met: paymentValueValidation.valid,
      label: paymentValueValidation.message || "Enter a valid payment value",
    },
    {
      met: !hasMissingActiveReferenceData,
      label: "Configure active reference data for all required dropdowns",
    },
  ];
  const missingSubmitRequirements = submitRequirements
    .filter((requirement) => !requirement.met)
    .map((requirement) => requirement.label);
  const canSubmit = missingSubmitRequirements.length === 0;

  const isLoading =
    peopleQuery.isLoading ||
    candidatesQuery.isLoading ||
    collaboratorsQuery.isLoading ||
    paymentMethodsQuery.isLoading ||
    sectorsQuery.isLoading ||
    locationsQuery.isLoading ||
    tasksQuery.isLoading ||
    statusesQuery.isLoading;

  const loadError =
    peopleQuery.error ||
    candidatesQuery.error ||
    collaboratorsQuery.error ||
    paymentMethodsQuery.error ||
    sectorsQuery.error ||
    locationsQuery.error ||
    tasksQuery.error ||
    statusesQuery.error;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setClientValidationError("");
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function selectEligiblePerson(person: Person) {
    update("personId", person.id);
    setPersonSearch("");
  }

  function clearEligiblePerson() {
    update("personId", "");
    setPersonSearch("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPerson) {
      setClientValidationError(
        "Select an eligible Person before creating a Collaborator.",
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
          flash: `Collaborator created for ${created.personNickname || created.personName || "selected person"}.`,
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
          <Link className="text-sm text-gray-500 underline" to={returnHref}>
            {requestedPersonId ? "Back to Person" : "Back to Collaborators"}
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
        {duplicateActiveCollaboratorError ? (
          <DuplicateActiveCollaboratorPanel
            person={selectedPerson}
            message={duplicateActiveCollaboratorError}
          />
        ) : (
          <ApiErrorPanel error={createMutation.error} />
        )}

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
                    Select an eligible Person
                  </h2>
                  <p className="mt-1 text-sm text-gray-500">
                    Only complete People who do not already have an active
                    Collaborator journey are eligible.
                  </p>
                </div>
                <div className="rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-700">
                  <span className="font-semibold">{eligiblePeople.length}</span>{" "}
                  eligible
                  {completePeopleWithActiveCollaborator.length > 0 && (
                    <span>
                      {" "}
                      · {completePeopleWithActiveCollaborator.length} already
                      collaborators
                    </span>
                  )}
                  {incompletePeopleCount > 0 && (
                    <span> · {incompletePeopleCount} incomplete</span>
                  )}
                </div>
              </div>

              {requestedPersonId && !selectedPerson && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">
                    This Person is not currently eligible for a new Collaborator journey.
                  </p>
                  <p className="mt-1">
                    They may already have an active Collaborator journey, or their Person profile may no longer be complete. You can choose another eligible Person below.
                  </p>
                </div>
              )}

              {!selectedPerson && (
                <div className="relative mt-4">
                  <label className="block text-sm font-medium text-gray-700">
                    Find eligible Person by nickname
                    <span className="text-red-600"> *</span>
                    <input
                      type="search"
                      role="combobox"
                      aria-autocomplete="list"
                      aria-controls={
                        showPersonSuggestions
                          ? "eligible-person-suggestions"
                          : undefined
                      }
                      aria-expanded={showPersonSuggestions}
                      disabled={eligiblePeople.length === 0}
                      value={personSearch}
                      onChange={(event) =>
                        setPersonSearch(event.target.value)
                      }
                      placeholder={
                        eligiblePeople.length === 0
                          ? "No eligible People available"
                          : "Type any part of a Person nickname"
                      }
                      className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                    />
                  </label>

                  {showPersonSuggestions && (
                    <div
                      id="eligible-person-suggestions"
                      role="listbox"
                      aria-label="Matching eligible People"
                      className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
                    >
                      {matchingEligiblePeople.length === 0 ? (
                        <p className="px-3 py-2 text-sm text-gray-500">
                          No matching eligible People
                        </p>
                      ) : (
                        matchingEligiblePeople.map((person) => (
                          <button
                            key={person.id}
                            type="button"
                            role="option"
                            aria-selected={person.id === form.personId}
                            onClick={() => selectEligiblePerson(person)}
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-800 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none"
                          >
                            {personLabel(person)}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedPerson && (
                <SelectedPersonCard
                  person={selectedPerson}
                  onChange={clearEligiblePerson}
                />
              )}

              {eligiblePeople.length === 0 && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <p className="font-semibold">
                    No eligible People are available.
                  </p>
                  <p className="mt-1">
                    A Person must be complete and must not already have an
                    active Collaborator journey before you can select them here.
                  </p>
                  <Link className="mt-2 inline-block underline" to="/people">
                    Go to People
                  </Link>
                </div>
              )}

              {completePeopleWithActiveCollaborator.length > 0 && (
                <AlreadyCollaboratorsPanel
                  people={completePeopleWithActiveCollaborator}
                />
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
                  type="text"
                  inputMode="decimal"
                  pattern={paymentValueConfig.pattern}
                  placeholder={paymentValueConfig.placeholder}
                  helperText={paymentValueConfig.helperText}
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
              <div className="mx-auto max-w-4xl space-y-3">
                {missingSubmitRequirements.length > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <p className="font-semibold">
                      Complete these fields to enable Create Collaborator:
                    </p>
                    <ul className="mt-1 list-disc pl-5">
                      {missingSubmitRequirements.map((requirement) => (
                        <li key={requirement}>{requirement}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <Link
                    to={returnHref}
                    className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm"
                  >
                    Cancel
                  </Link>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || !canSubmit}
                    title={
                      canSubmit
                        ? "Create Collaborator"
                        : `Missing: ${missingSubmitRequirements.join(", ")}`
                    }
                    className="rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createMutation.isPending
                      ? "Creating..."
                      : "Create Collaborator"}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}

function AlreadyCollaboratorsPanel({ people }: { people: Person[] }) {
  return (
    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
      <p className="font-semibold">
        Already active Collaborators are hidden from eligible Person suggestions.
      </p>
      <p className="mt-1">
        These complete People already have an active Collaborator journey and
        cannot be selected again.
      </p>
      <ul className="mt-3 list-disc space-y-1 pl-5">
        {people.map((person) => (
          <li key={person.id}>
            <Link
              className="font-semibold underline"
              to={`/people/${person.id}`}
            >
              {personLabel(person)}
            </Link>
          </li>
        ))}
      </ul>
      <Link
        className="mt-3 inline-block font-semibold underline"
        to="/collaborators"
      >
        View Collaborators
      </Link>
    </div>
  );
}

function DuplicateActiveCollaboratorPanel({
  person,
  message,
}: {
  person?: Person;
  message: string;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900 shadow-sm">
      <p className="text-base font-semibold">
        This Person already has an active Collaborator journey.
      </p>
      <p className="mt-1 text-sm">{message}</p>
      {person && (
        <p className="mt-2 text-sm">
          Selected Person:{" "}
          <span className="font-semibold">{personLabel(person)}</span>
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
        <Link className="underline" to="/collaborators">
          View Collaborators
        </Link>
        {person && (
          <Link className="underline" to={`/people/${person.id}`}>
            View Person
          </Link>
        )}
      </div>
    </div>
  );
}

function getDuplicateActiveCollaboratorError(error: unknown) {
  if (!(error instanceof ApiError)) return "";

  const personMessage = error.fields?.personId ?? "";
  if (!personMessage.toLowerCase().includes("active collaborator")) {
    return "";
  }

  return personMessage;
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

function SelectedPersonCard({
  person,
  onChange,
}: {
  person: Person;
  onChange: () => void;
}) {
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
        <div className="flex shrink-0 items-center gap-3">
          <Link className="font-semibold underline" to={`/people/${person.id}`}>
            View Person
          </Link>
          <button
            type="button"
            onClick={onChange}
            className="rounded-lg border border-green-300 bg-white px-3 py-1 font-semibold text-green-800"
          >
            Change Person
          </button>
        </div>
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
  inputMode,
  pattern,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
  pattern?: string;
  helperText?: string;
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
        inputMode={inputMode}
        pattern={pattern}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
      />
      {helperText && (
        <span className="mt-1 block text-xs font-normal text-gray-500">
          {helperText}
        </span>
      )}
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

function isActiveCollaborator(collaborator: Collaborator) {
  return !collaborator.closedAt;
}

function filterEligiblePeopleByNickname(people: Person[], filter: string) {
  const normalizedFilter = normalizePersonNickname(filter);
  if (!normalizedFilter) return [];

  return people.filter((person) => {
    const nickname = person.nickname?.trim() || personLabel(person);
    return normalizePersonNickname(nickname).includes(normalizedFilter);
  });
}

function normalizePersonNickname(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase();
}

function personLabel(person: Person) {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return person.nickname ? `${name} (${person.nickname})` : name;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}
